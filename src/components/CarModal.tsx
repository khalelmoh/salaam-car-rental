import React, { useState } from 'react';
import { X } from 'lucide-react';
import Button from './Button';
import type { ManagedCar } from '../types/models';
import './CarModal.css';

interface CarModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (car: ManagedCar) => void | Promise<void>;
    car?: ManagedCar | null;
}

const CarModal = ({ isOpen, onClose, onSave, car }: CarModalProps) => {
    const [formData, setFormData] = useState<Partial<ManagedCar>>(() => car || {
        name: '',
        category: 'Sedan',
        licensePlate: '',
        pricePerDay: 0,
        status: 'Available',
        transmission: 'Automatic',
        seats: 5,
        fuelType: 'Petrol',
        mpg: '25/30',
        image: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&q=80&w=800'
    });

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await onSave({
            ...formData,
            id: car?.id || Date.now().toString(),
        } as ManagedCar);
        onClose();
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: name === 'pricePerDay' || name === 'seats' ? Number(value) : value
        }));
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <div className="modal-header">
                    <h2>{car ? 'Edit Vehicle' : 'Add New Vehicle'}</h2>
                    <button className="close-btn" onClick={onClose}>
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="car-form">
                    <div className="form-group full-width">
                        <label>Vehicle Name</label>
                        <input
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            required
                            placeholder="e.g. Tesla Model 3"
                        />
                    </div>

                    <div className="form-group">
                        <label>Category</label>
                        <select name="category" value={formData.category} onChange={handleChange}>
                            <option value="Sedan">Sedan</option>
                            <option value="SUV">SUV</option>
                            <option value="Luxury">Luxury</option>
                            <option value="Sports">Sports</option>
                            <option value="Van">Van</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label>License Plate</label>
                        <input
                            type="text"
                            name="licensePlate"
                            value={formData.licensePlate}
                            onChange={handleChange}
                            required
                            placeholder="DXB-1234"
                        />
                    </div>

                    <div className="form-group">
                        <label>Price Per Day ($)</label>
                        <input
                            type="number"
                            name="pricePerDay"
                            value={formData.pricePerDay}
                            onChange={handleChange}
                            required
                            min="0"
                        />
                    </div>

                    <div className="form-group">
                        <label>Status</label>
                        <select name="status" value={formData.status} onChange={handleChange}>
                            <option value="Available">Available</option>
                            <option value="Rented">Rented</option>
                            <option value="Maintenance">Maintenance</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Transmission</label>
                        <select name="transmission" value={formData.transmission} onChange={handleChange}>
                            <option value="Automatic">Automatic</option>
                            <option value="Manual">Manual</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Seats</label>
                        <input
                            type="number"
                            name="seats"
                            value={formData.seats}
                            onChange={handleChange}
                            required
                            min="1"
                        />
                    </div>

                    <div className="form-group">
                        <label>Fuel Type</label>
                        <select name="fuelType" value={formData.fuelType} onChange={handleChange}>
                            <option value="Petrol">Petrol</option>
                            <option value="Diesel">Diesel</option>
                            <option value="Electric">Electric</option>
                            <option value="Hybrid">Hybrid</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label>MPG / Range</label>
                        <input
                            type="text"
                            name="mpg"
                            value={formData.mpg}
                            onChange={handleChange}
                            required
                            placeholder="e.g. 25/30 or 300mi"
                        />
                    </div>

                    <div className="form-group full-width">
                        <label>Image URL</label>
                        <input
                            type="text"
                            name="image"
                            value={formData.image}
                            onChange={handleChange}
                            required
                        />
                    </div>

                    <div className="modal-footer">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit">
                            {car ? 'Save Changes' : 'Add Vehicle'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CarModal;
