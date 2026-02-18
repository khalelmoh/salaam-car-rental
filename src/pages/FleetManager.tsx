import { useState, useEffect } from 'react';
import { Plus, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../layouts/DashboardLayout';
import CarTable from '../components/CarTable';
import Button from '../components/Button';
import CarModal from '../components/CarModal';
import { api } from '../lib/api';
import type { ManagedCar } from '../types/models';
import './FleetManager.css';

const FleetManager = () => {
    const navigate = useNavigate();
    const [fleet, setFleet] = useState<ManagedCar[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCar, setEditingCar] = useState<ManagedCar | null>(null);

    useEffect(() => {
        const load = async () => {
            setError('');
            setIsLoading(true);
            try {
                const data = await api.listCars();
                setFleet(data);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load fleet.');
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, []);

    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('All');
    const [sortBy, setSortBy] = useState<string>('name');

    const handleDelete = async (id: string) => {
        if (window.confirm('Are you sure you want to remove this vehicle?')) {
            try {
                await api.deleteCar(id);
                setFleet(fleet.filter(c => c.id !== id));
                setSuccess('Vehicle deleted.');
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Delete failed.');
            }
        }
    };

    const handleEdit = (car: ManagedCar) => {
        setEditingCar(car);
        setIsModalOpen(true);
    };

    const handleAddNew = () => {
        setEditingCar(null);
        setIsModalOpen(true);
    };

    const handleSave = async (car: ManagedCar) => {
        setError('');
        setSuccess('');
        try {
            if (editingCar) {
                const updated = await api.updateCar(car.id, car);
                setFleet(fleet.map(c => c.id === updated.id ? updated : c));
                setSuccess('Vehicle updated.');
            } else {
                const payload = {
                    name: car.name,
                    category: car.category,
                    image: car.image,
                    pricePerDay: car.pricePerDay,
                    transmission: car.transmission,
                    seats: car.seats,
                    fuelType: car.fuelType,
                    mpg: car.mpg,
                    status: car.status,
                    licensePlate: car.licensePlate,
                };
                const created = await api.createCar(payload);
                setFleet([created, ...fleet]);
                setSuccess('Vehicle added.');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Save failed.');
            throw err;
        }
    };

    // Filter and Sort Logic
    const filteredFleet = fleet.filter(car => {
        const matchesSearch = car.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            car.licensePlate.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'All' || car.status === statusFilter;
        return matchesSearch && matchesStatus;
    }).sort((a, b) => {
        if (sortBy === 'price-asc') return a.pricePerDay - b.pricePerDay;
        if (sortBy === 'price-desc') return b.pricePerDay - a.pricePerDay;
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        return 0;
    });

    return (
        <DashboardLayout title="Fleet Management">
            {isLoading && <div className="section-card" style={{ marginBottom: '1rem', padding: '1rem' }}>Loading fleet...</div>}
            {error && <div className="section-card" style={{ marginBottom: '1rem', padding: '1rem', color: '#dc2626' }}>{error}</div>}
            {success && <div className="section-card" style={{ marginBottom: '1rem', padding: '1rem', color: '#15803d' }}>{success}</div>}
            <div className="fleet-controls">
                <div className="control-group">
                    <input
                        type="text"
                        placeholder="Search vehicles..."
                        className="table-search"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <select
                        className="table-select"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                    >
                        <option value="All">All Statuses</option>
                        <option value="Available">Available</option>
                        <option value="Rented">Rented</option>
                        <option value="Maintenance">Maintenance</option>
                    </select>
                    <select
                        className="table-select"
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                    >
                        <option value="name">Sort by Name</option>
                        <option value="price-asc">Price: Low to High</option>
                        <option value="price-desc">Price: High to Low</option>
                    </select>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Button variant="outline" onClick={() => navigate('/fleet/catalog')}>
                        <ExternalLink size={18} /> Open Catalog
                    </Button>
                    <Button onClick={handleAddNew}>
                        <Plus size={18} /> Add New Vehicle
                    </Button>
                </div>
            </div>

            <CarTable
                cars={filteredFleet}
                onEdit={handleEdit}
                onDelete={handleDelete}
            />

            <CarModal
                key={editingCar?.id || 'new'}
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSave}
                car={editingCar}
            />
        </DashboardLayout>
    );
};

export default FleetManager;
