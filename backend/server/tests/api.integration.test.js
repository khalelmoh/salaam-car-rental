import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../app.js';
import { initializeBackend } from '../startup.js';

let app;
let authToken = '';

const round2 = (value) => Number(Number(value || 0).toFixed(2));

async function waitForReportJobCompletion(appInstance, token, jobId, maxAttempts = 30) {
  let attempts = 0;
  let latest = null;
  while (attempts < maxAttempts) {
    const jobGet = await request(appInstance)
      .get(`/api/reports/jobs/${jobId}`)
      .set('Authorization', `Bearer ${token}`);
    assert.equal(jobGet.status, 200);
    latest = jobGet.body;
    if (latest.status === 'completed' || latest.status === 'failed') {
      return latest;
    }
    attempts += 1;
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  assert.fail(`Report job ${jobId} did not complete within ${maxAttempts} attempts.`);
}

before(async () => {
  await initializeBackend();
  app = createApp();

  const login = await request(app).post('/api/auth/login').send({
    email: 'admin@salaam.com',
    password: 'admin',
  });

  assert.equal(login.status, 200);
  assert.ok(login.body.token);
  authToken = login.body.token;
});

test('auth: login returns token and user payload', async () => {
  const response = await request(app).post('/api/auth/login').send({
    email: 'admin@salaam.com',
    password: 'admin',
  });

  assert.equal(response.status, 200);
  assert.ok(response.body.token);
  assert.equal(response.body.user.email, 'admin@salaam.com');
});

test('bookings: rejects invalid payload', async () => {
  const response = await request(app)
    .post('/api/bookings')
    .set('Authorization', `Bearer ${authToken}`)
    .send({});

  assert.equal(response.status, 400);
  assert.match(String(response.body.error || ''), /invalid|required/i);
});

test('transactions: create/list/delete expense flow', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const created = await request(app)
    .post('/api/transactions')
    .set('Authorization', `Bearer ${authToken}`)
    .send({
      date: today,
      description: 'Integration test expense',
      type: 'Expense',
      amount: 12.5,
      category: 'Testing',
    });

  assert.equal(created.status, 201);
  assert.ok(created.body.id);

  const list = await request(app)
    .get('/api/transactions')
    .set('Authorization', `Bearer ${authToken}`);
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.body));
  assert.ok(list.body.some((trx) => trx.id === created.body.id));

  const deleted = await request(app)
    .delete(`/api/transactions/${created.body.id}`)
    .set('Authorization', `Bearer ${authToken}`);
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.success, true);
});

test('bookings revenue is recognized only after payment is marked paid', async () => {
  const carsRes = await request(app).get('/api/cars').set('Authorization', `Bearer ${authToken}`);
  const customersRes = await request(app).get('/api/customers').set('Authorization', `Bearer ${authToken}`);
  assert.equal(carsRes.status, 200);
  assert.equal(customersRes.status, 200);
  assert.ok(Array.isArray(carsRes.body) && carsRes.body.length > 0);
  assert.ok(Array.isArray(customersRes.body) && customersRes.body.length > 0);

  const car = carsRes.body.find((c) => c.status === 'Available') || carsRes.body[0];
  const customer = customersRes.body[0];

  const startDate = '2099-01-10';
  const endDate = '2099-01-11';

  const created = await request(app)
    .post('/api/bookings')
    .set('Authorization', `Bearer ${authToken}`)
    .send({
      carId: car.id,
      customerId: customer.id,
      startDate,
      startTime: '09:00',
      endDate,
      endTime: '10:00',
      discountType: 'fixed',
      discountValue: 0,
    });

  assert.equal(created.status, 201);
  assert.equal(created.body.paymentStatus, 'pending');

  const bookingId = created.body.id;

  const txPending = await request(app)
    .get('/api/transactions')
    .set('Authorization', `Bearer ${authToken}`);
  assert.equal(txPending.status, 200);
  assert.ok(!txPending.body.some((t) => t.bookingId === bookingId));

  const dashboardPending = await request(app)
    .get('/api/dashboard')
    .set('Authorization', `Bearer ${authToken}`);
  assert.equal(dashboardPending.status, 200);
  const pendingRevenue = Number(dashboardPending.body.totalRevenue || 0);

  const markedPaid = await request(app)
    .put(`/api/bookings/${bookingId}`)
    .set('Authorization', `Bearer ${authToken}`)
    .send({ paymentStatus: 'paid' });
  assert.equal(markedPaid.status, 200);
  assert.equal(markedPaid.body.paymentStatus, 'paid');

  const txPaid = await request(app)
    .get('/api/transactions')
    .set('Authorization', `Bearer ${authToken}`);
  assert.equal(txPaid.status, 200);
  assert.ok(txPaid.body.some((t) => t.bookingId === bookingId));

  const dashboardPaid = await request(app)
    .get('/api/dashboard')
    .set('Authorization', `Bearer ${authToken}`);
  assert.equal(dashboardPaid.status, 200);
  const paidRevenue = Number(dashboardPaid.body.totalRevenue || 0);
  assert.ok(paidRevenue >= pendingRevenue);

  const deleted = await request(app)
    .delete(`/api/bookings/${bookingId}`)
    .set('Authorization', `Bearer ${authToken}`);
  assert.equal(deleted.status, 200);
});

test('reports/finance applies paid-pending-commission rules', async () => {
  const carsRes = await request(app).get('/api/cars').set('Authorization', `Bearer ${authToken}`);
  const customersRes = await request(app).get('/api/customers').set('Authorization', `Bearer ${authToken}`);
  assert.equal(carsRes.status, 200);
  assert.equal(customersRes.status, 200);
  assert.ok(Array.isArray(carsRes.body) && carsRes.body.length > 0);
  assert.ok(Array.isArray(customersRes.body) && customersRes.body.length > 0);

  const car = carsRes.body.find((c) => c.status === 'Available') || carsRes.body[0];
  const customer = customersRes.body[0];

  const baseReport = await request(app)
    .get('/api/reports/finance?includeDetails=false')
    .set('Authorization', `Bearer ${authToken}`);
  assert.equal(baseReport.status, 200);
  assert.ok(baseReport.body.reportVersion);
  assert.ok(baseReport.body.generatedAt);
  assert.equal(baseReport.body.timezone, 'UTC');
  assert.ok(baseReport.body.generatedBy?.id);
  assert.ok(baseReport.body.metadata);
  assert.ok(typeof baseReport.body.metadata.rowCount === 'number');
  assert.ok(typeof baseReport.body.metadata.pageRowCount === 'number');
  assert.equal(baseReport.body.metadata.timezone, 'UTC');
  const baseIncome = Number(baseReport.body.summary?.income || 0);
  const baseExpenses = Number(baseReport.body.summary?.expenses || 0);
  const basePending = Number(baseReport.body.summary?.pendingAmount || 0);

  const startDay = Math.floor(Math.random() * 20) + 1;
  const endDay = startDay + 1;
  const startDate = `2100-01-${String(startDay).padStart(2, '0')}`;
  const endDate = `2100-01-${String(endDay).padStart(2, '0')}`;

  const bookingCreate = await request(app)
    .post('/api/bookings')
    .set('Authorization', `Bearer ${authToken}`)
    .send({
      carId: car.id,
      customerId: customer.id,
      startDate,
      startTime: '10:00',
      endDate,
      endTime: '11:00',
      discountType: 'fixed',
      discountValue: 0,
    });
  assert.equal(bookingCreate.status, 201);
  const bookingId = bookingCreate.body.id;
  const bookingAmount = Number(bookingCreate.body.totalAmount || 0);

  const pendingReport = await request(app)
    .get('/api/reports/finance?includeDetails=false')
    .set('Authorization', `Bearer ${authToken}`);
  assert.equal(pendingReport.status, 200);
  assert.equal(Number(pendingReport.body.summary?.income || 0), baseIncome);
  assert.equal(Number(pendingReport.body.summary?.pendingAmount || 0), Number((basePending + bookingAmount).toFixed(2)));

  const markPaid = await request(app)
    .put(`/api/bookings/${bookingId}`)
    .set('Authorization', `Bearer ${authToken}`)
    .send({ paymentStatus: 'paid' });
  assert.equal(markPaid.status, 200);

  const paidReport = await request(app)
    .get('/api/reports/finance?includeDetails=false')
    .set('Authorization', `Bearer ${authToken}`);
  assert.equal(paidReport.status, 200);
  assert.equal(Number(paidReport.body.summary?.income || 0), Number((baseIncome + bookingAmount).toFixed(2)));
  assert.equal(Number(paidReport.body.summary?.pendingAmount || 0), basePending);

  const today = new Date().toISOString().slice(0, 10);
  const commissionCreate = await request(app)
    .post('/api/transactions')
    .set('Authorization', `Bearer ${authToken}`)
    .send({
      date: today,
      description: 'Integration test commission',
      type: 'Commission',
      amount: 7,
      category: 'Commission',
    });
  assert.equal(commissionCreate.status, 201);

  const commissionReport = await request(app)
    .get('/api/reports/finance?includeDetails=false')
    .set('Authorization', `Bearer ${authToken}`);
  assert.equal(commissionReport.status, 200);
  assert.equal(Number(commissionReport.body.summary?.income || 0), Number((baseIncome + bookingAmount).toFixed(2)));
  assert.equal(Number(commissionReport.body.summary?.expenses || 0), Number((baseExpenses + 7).toFixed(2)));

  const deleteCommission = await request(app)
    .delete(`/api/transactions/${commissionCreate.body.id}`)
    .set('Authorization', `Bearer ${authToken}`);
  assert.equal(deleteCommission.status, 200);

  const deleteBooking = await request(app)
    .delete(`/api/bookings/${bookingId}`)
    .set('Authorization', `Bearer ${authToken}`);
  assert.equal(deleteBooking.status, 200);
});

test('reports phase-2 endpoints: customers, fleet, presets, async jobs', async () => {
  const customersReport = await request(app)
    .get('/api/reports/customers?page=1&pageSize=5')
    .set('Authorization', `Bearer ${authToken}`);
  assert.equal(customersReport.status, 200);
  assert.ok(customersReport.body.reportVersion);
  assert.ok(customersReport.body.generatedAt);
  assert.ok(customersReport.body.generatedBy?.id);
  assert.ok(customersReport.body.metadata);
  assert.equal(customersReport.body.metadata.timezone, 'UTC');
  assert.ok(Array.isArray(customersReport.body.rows));

  const fleetReport = await request(app)
    .get('/api/reports/fleet?page=1&pageSize=5')
    .set('Authorization', `Bearer ${authToken}`);
  assert.equal(fleetReport.status, 200);
  assert.ok(fleetReport.body.reportVersion);
  assert.ok(fleetReport.body.generatedAt);
  assert.ok(fleetReport.body.generatedBy?.id);
  assert.ok(fleetReport.body.metadata);
  assert.equal(fleetReport.body.metadata.timezone, 'UTC');
  assert.ok(Array.isArray(fleetReport.body.rows));

  const presetCreate = await request(app)
    .post('/api/reports/presets')
    .set('Authorization', `Bearer ${authToken}`)
    .send({
      name: 'Finance This Month',
      scope: 'finance',
      filters: { from: '2026-01-01', to: '2026-12-31', includeDetails: false },
    });
  assert.equal(presetCreate.status, 201);
  assert.ok(presetCreate.body.id);

  const presetsList = await request(app)
    .get('/api/reports/presets?scope=finance')
    .set('Authorization', `Bearer ${authToken}`);
  assert.equal(presetsList.status, 200);
  assert.ok(Array.isArray(presetsList.body));
  assert.ok(presetsList.body.some((p) => p.id === presetCreate.body.id));

  const jobCreate = await request(app)
    .post('/api/reports/jobs')
    .set('Authorization', `Bearer ${authToken}`)
    .send({
      reportType: 'finance',
      format: 'json',
      filters: { includeDetails: false },
    });
  assert.equal(jobCreate.status, 202);
  assert.ok(jobCreate.body.id);

  let jobStatus = 'pending';
  let attempts = 0;
  while ((jobStatus === 'pending' || jobStatus === 'running') && attempts < 20) {
    const jobGet = await request(app)
      .get(`/api/reports/jobs/${jobCreate.body.id}`)
      .set('Authorization', `Bearer ${authToken}`);
    assert.equal(jobGet.status, 200);
    jobStatus = jobGet.body.status;
    if (jobStatus === 'completed') {
      assert.ok(jobGet.body.result);
      break;
    }
    attempts += 1;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(jobStatus, 'completed');

  const presetDelete = await request(app)
    .delete(`/api/reports/presets/${presetCreate.body.id}`)
    .set('Authorization', `Bearer ${authToken}`);
  assert.equal(presetDelete.status, 200);
  assert.equal(presetDelete.body.success, true);
});

test('reports golden dataset snapshots + edge cases + export jobs', async () => {
  const cleanup = {
    bookingIds: [],
    transactionIds: [],
    customerId: null,
  };

  const safeDelete = async (path) => {
    const response = await request(app)
      .delete(path)
      .set('Authorization', `Bearer ${authToken}`);
    assert.ok([200, 404].includes(response.status));
  };

  try {
    const carsRes = await request(app).get('/api/cars').set('Authorization', `Bearer ${authToken}`);
    assert.equal(carsRes.status, 200);
    const car = carsRes.body.find((c) => c.status !== 'Maintenance') || carsRes.body[0];
    assert.ok(car?.id);

    const uniqueSuffix = `${Date.now()}`;
    const customerCreate = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        fullName: `Report Test ${uniqueSuffix}`,
        phone: `+25261${uniqueSuffix.slice(-6)}`,
        email: `number-damiinka-${uniqueSuffix}@test.local`,
        nationalId: `NID-${uniqueSuffix}`,
        driverLicenseNumber: `DL-${uniqueSuffix}`,
        damiin: `Damiin ${uniqueSuffix}`,
        address: 'Mogadishu',
      });
    assert.equal(customerCreate.status, 201);
    cleanup.customerId = customerCreate.body.id;

    const rangeFrom = '2102-05-01';
    const rangeTo = '2102-05-31';

    const createBookingPayload = (startDate, endDate) => ({
      carId: car.id,
      customerId: cleanup.customerId,
      startDate,
      startTime: '09:00',
      endDate,
      endTime: '10:00',
      discountType: 'fixed',
      discountValue: 0,
    });

    const paidBookingCreate = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${authToken}`)
      .send(createBookingPayload('2102-05-10', '2102-05-12'));
    assert.equal(paidBookingCreate.status, 201);
    cleanup.bookingIds.push(paidBookingCreate.body.id);
    const paidBookingAmount = round2(paidBookingCreate.body.totalAmount);

    const pendingBookingCreate = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${authToken}`)
      .send(createBookingPayload('2102-05-15', '2102-05-16'));
    assert.equal(pendingBookingCreate.status, 201);
    cleanup.bookingIds.push(pendingBookingCreate.body.id);
    const pendingBookingAmount = round2(pendingBookingCreate.body.totalAmount);

    const cancelledBookingCreate = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${authToken}`)
      .send(createBookingPayload('2102-05-20', '2102-05-21'));
    assert.equal(cancelledBookingCreate.status, 201);
    cleanup.bookingIds.push(cancelledBookingCreate.body.id);
    const cancelledBookingAmount = round2(cancelledBookingCreate.body.totalAmount);

    const markPaid = await request(app)
      .put(`/api/bookings/${paidBookingCreate.body.id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ paymentStatus: 'paid' });
    assert.equal(markPaid.status, 200);

    const markCancelled = await request(app)
      .put(`/api/bookings/${cancelledBookingCreate.body.id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ status: 'cancelled' });
    assert.equal(markCancelled.status, 200);

    const commissionCreate = await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        date: '2102-05-11',
        description: 'Golden dataset commission',
        type: 'Commission',
        amount: 40,
        category: 'Commission',
      });
    assert.equal(commissionCreate.status, 201);
    cleanup.transactionIds.push(commissionCreate.body.id);

    const expenseCreate = await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        date: '2102-05-11',
        description: 'Golden dataset expense',
        type: 'Expense',
        amount: 30,
        category: 'Operations',
      });
    assert.equal(expenseCreate.status, 201);
    cleanup.transactionIds.push(expenseCreate.body.id);

    const incomeOutOfRangeCreate = await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        date: '2102-06-01',
        description: 'Golden dataset income out-of-range',
        type: 'Income',
        amount: 55,
        category: 'General',
      });
    assert.equal(incomeOutOfRangeCreate.status, 201);
    cleanup.transactionIds.push(incomeOutOfRangeCreate.body.id);

    const financeReport = await request(app)
      .get(`/api/reports/finance?from=${rangeFrom}&to=${rangeTo}&includeDetails=true&page=1&pageSize=100`)
      .set('Authorization', `Bearer ${authToken}`);
    assert.equal(financeReport.status, 200);
    assert.equal(financeReport.body.reportVersion, '1.1');
    assert.equal(financeReport.body.metadata.timezone, 'UTC');
    assert.ok(financeReport.body.metadata.generatedBy?.id);
    assert.equal(round2(financeReport.body.summary.income), paidBookingAmount);
    assert.equal(round2(financeReport.body.summary.expenses), 70);
    assert.equal(round2(financeReport.body.summary.netProfit), round2(paidBookingAmount - 70));
    assert.equal(round2(financeReport.body.summary.pendingAmount), pendingBookingAmount);
    assert.ok(financeReport.body.rows.some((row) => row.bookingId === paidBookingCreate.body.id));
    assert.ok(!financeReport.body.rows.some((row) => row.bookingId === pendingBookingCreate.body.id));
    assert.ok(!financeReport.body.rows.some((row) => row.bookingId === cancelledBookingCreate.body.id));
    assert.ok(!financeReport.body.rows.some((row) => row.id === incomeOutOfRangeCreate.body.id));

    const financeEmptyRange = await request(app)
      .get('/api/reports/finance?from=2102-06-10&to=2102-06-12&includeDetails=false')
      .set('Authorization', `Bearer ${authToken}`);
    assert.equal(financeEmptyRange.status, 200);
    assert.equal(round2(financeEmptyRange.body.summary.income), 0);
    assert.equal(round2(financeEmptyRange.body.summary.expenses), 0);
    assert.equal(round2(financeEmptyRange.body.summary.pendingAmount), 0);

    const customerReport = await request(app)
      .get(`/api/reports/customers?customerId=${cleanup.customerId}&from=${rangeFrom}&to=${rangeTo}&page=1&pageSize=50`)
      .set('Authorization', `Bearer ${authToken}`);
    assert.equal(customerReport.status, 200);
    assert.equal(customerReport.body.reportVersion, '1.1');
    assert.equal(customerReport.body.metadata.timezone, 'UTC');
    assert.equal(customerReport.body.summary.totalCustomers, 1);
    assert.equal(customerReport.body.summary.totalBookings, 3);
    assert.equal(round2(customerReport.body.summary.totalPaid), paidBookingAmount);
    assert.equal(round2(customerReport.body.summary.totalPending), round2(pendingBookingAmount + cancelledBookingAmount));
    assert.equal(customerReport.body.rows.length, 3);

    const fleetReport = await request(app)
      .get(`/api/reports/fleet?carId=${car.id}&from=${rangeFrom}&to=${rangeTo}&page=1&pageSize=50`)
      .set('Authorization', `Bearer ${authToken}`);
    assert.equal(fleetReport.status, 200);
    assert.equal(fleetReport.body.reportVersion, '1.1');
    assert.equal(fleetReport.body.metadata.timezone, 'UTC');
    assert.equal(fleetReport.body.summary.totalCars, 1);
    assert.equal(fleetReport.body.summary.totalBookings, 3);
    assert.equal(round2(fleetReport.body.summary.totalPaidRevenue), paidBookingAmount);
    assert.equal(round2(fleetReport.body.summary.totalPendingRevenue), round2(pendingBookingAmount + cancelledBookingAmount));
    assert.equal(fleetReport.body.rows[0].carId, car.id);

    const exportJobs = [
      {
        reportType: 'finance',
        format: 'json',
        filters: { from: rangeFrom, to: rangeTo, includeDetails: false },
      },
      {
        reportType: 'customers',
        format: 'pdf',
        filters: { customerId: cleanup.customerId, from: rangeFrom, to: rangeTo },
      },
      {
        reportType: 'fleet',
        format: 'xlsx',
        filters: { carId: car.id, from: rangeFrom, to: rangeTo },
      },
    ];

    for (const jobPayload of exportJobs) {
      const createJob = await request(app)
        .post('/api/reports/jobs')
        .set('Authorization', `Bearer ${authToken}`)
        .send(jobPayload);
      assert.equal(createJob.status, 202);
      const completed = await waitForReportJobCompletion(app, authToken, createJob.body.id);
      assert.equal(completed.status, 'completed');
      assert.ok(completed.result);
      assert.ok(completed.result.reportVersion);
      assert.ok(typeof completed.result.rowCount === 'number');
      assert.ok(typeof completed.result.pageRowCount === 'number');
      if (jobPayload.format === 'json') {
        assert.ok(completed.result.data?.summary);
      } else {
        assert.ok(String(completed.result.data?.message || '').includes('generation metadata ready'));
      }
    }
  } finally {
    for (const transactionId of cleanup.transactionIds.reverse()) {
      await safeDelete(`/api/transactions/${transactionId}`);
    }
    for (const bookingId of cleanup.bookingIds.reverse()) {
      await safeDelete(`/api/bookings/${bookingId}`);
    }
    if (cleanup.customerId) {
      await safeDelete(`/api/customers/${cleanup.customerId}`);
    }
  }
});
