import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../app.js';
import { initializeBackend } from '../startup.js';

let app;
let authToken = '';

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

test('finance closes: daily and monthly closing process', async () => {
  // 1. Create a transaction on a specific date to ensure there's activity
  const closeDate = '2025-08-15';
  
  const carsRes = await request(app).get('/api/cars').set('Authorization', `Bearer ${authToken}`);
  const car = carsRes.body[0];

  const trxCreate = await request(app)
    .post('/api/transactions')
    .set('Authorization', `Bearer ${authToken}`)
    .send({
      date: closeDate,
      description: 'Test transaction for daily close',
      type: 'Expense',
      amount: 50,
      category: 'Operations',
      carId: car.id,
    });
  assert.equal(trxCreate.status, 201);

  // 2. Perform daily close
  const dailyCloseRes = await request(app)
    .post('/api/finance/close/daily')
    .set('Authorization', `Bearer ${authToken}`)
    .send({ date: closeDate });
  
  assert.equal(dailyCloseRes.status, 201);
  assert.equal(dailyCloseRes.body.closeDate, closeDate);
  assert.equal(dailyCloseRes.body.status, 'closed');
  assert.equal(dailyCloseRes.body.isLocked, true);

  // 3. Perform monthly close for the same month
  const monthlyCloseRes = await request(app)
    .post('/api/finance/close/monthly')
    .set('Authorization', `Bearer ${authToken}`)
    .send({ year: 2025, month: 8 });

  assert.equal(monthlyCloseRes.status, 201);
  assert.equal(monthlyCloseRes.body.year, 2025);
  assert.equal(monthlyCloseRes.body.month, 8);
  assert.equal(monthlyCloseRes.body.status, 'closed');
  assert.equal(monthlyCloseRes.body.isLocked, true);

  // 4. Verify overview includes the closes
  const overviewRes = await request(app)
    .get('/api/finance/close')
    .set('Authorization', `Bearer ${authToken}`);
  
  assert.equal(overviewRes.status, 200);
  assert.ok(overviewRes.body.daily.find(d => d.closeDate === closeDate));
  assert.ok(overviewRes.body.monthly.find(m => m.year === 2025 && m.month === 8));

  // 5. Verify transaction updates are locked for the closed period
  const trxUpdate = await request(app)
    .put(`/api/transactions/${trxCreate.body.id}`)
    .set('Authorization', `Bearer ${authToken}`)
    .send({
      date: closeDate,
      description: 'Updated description',
      type: 'Expense',
      amount: 60,
      category: 'Operations',
      carId: car.id,
    });
  
  // Should be 409 Conflict according to accountingService.js (Date locked by daily close)
  assert.equal(trxUpdate.status, 409);
  assert.match(String(trxUpdate.body.error), /locked by daily close|locked by monthly close/);
  
  // 6. Verify transaction deletion is STILL ALLOWED (user requested this in a previous session)
  const trxDelete = await request(app)
    .delete(`/api/transactions/${trxCreate.body.id}`)
    .set('Authorization', `Bearer ${authToken}`);
  
  assert.equal(trxDelete.status, 200);
});
