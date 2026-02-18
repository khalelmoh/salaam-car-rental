import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import DashboardLayout from '../layouts/DashboardLayout';
import CarTable, { type ManagedCar } from '../components/CarTable';
import Button from '../components/Button';
import { cars as initialCars } from '../data/cars';
import './FleetManager.css';

const FleetManager = () => {
    // Augment initial data with management fields
    const [fleet, setFleet] = useState<ManagedCar[]>(() => {
        const saved = localStorage.getItem('salaam_fleet');
        if (saved) {
            return JSON.parse(saved);
        }
        return initialCars.map(c => ({
            ...c,
            status: Math.random() > 0.3 ? 'Available' : (Math.random() > 0.5 ? 'Rented' : 'Maintenance'),
            licensePlate: `DXB-${Math.floor(1000 + Math.random() * 9000)}`
        })) as ManagedCar[];
    });

    // Persist fleet changes
    useEffect(() => {
        localStorage.setItem('salaam_fleet', JSON.stringify(fleet));
    }, [fleet]);

    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('All');
    const [sortBy, setSortBy] = useState<string>('name');

    const handleDelete = (id: string) => {
        if (window.confirm('Are you sure you want to remove this vehicle?')) {
            setFleet(fleet.filter(c => c.id !== id));
        }
    };

    const handleEdit = (car: any) => {
        alert(`Edit functionality for ${car.name} coming soon!`);
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
                <Button onClick={() => alert('Add Car Modal')}>
                    <Plus size={18} /> Add New Vehicle
                </Button>
            </div>

            <CarTable
                cars={filteredFleet}
                onEdit={handleEdit}
                onDelete={handleDelete}
            />
        </DashboardLayout>
    );
};

export default FleetManager;
