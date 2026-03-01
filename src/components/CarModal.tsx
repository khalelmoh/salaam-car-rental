import React, { useEffect, useState } from 'react';
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

const PRESET_OWNERS = ['Abdirahman Esse', 'Abdiqani Yusuf', 'Yahye Ali'] as const;

const CarModal = ({ isOpen, onClose, onSave, car }: CarModalProps) => {
    const [formData, setFormData] = useState<Partial<ManagedCar>>(() => car || {
        name: '',
        category: '',
        ownerPhone: '',
        licensePlate: '',
        pricePerDay: 0,
        status: 'Available',
        image: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&q=80&w=800'
    });
    const initialOwner = car?.category || '';
    const [ownerSelection, setOwnerSelection] = useState<string>(
        initialOwner && !PRESET_OWNERS.includes(initialOwner as typeof PRESET_OWNERS[number])
            ? 'Other'
            : initialOwner
    );
    const [otherOwnerName, setOtherOwnerName] = useState<string>(
        initialOwner && !PRESET_OWNERS.includes(initialOwner as typeof PRESET_OWNERS[number]) ? initialOwner : ''
    );

    useEffect(() => {
        const onEsc = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        window.addEventListener('keydown', onEsc);
        return () => window.removeEventListener('keydown', onEsc);
    }, [isOpen, onClose]);

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
            [name]: name === 'pricePerDay' ? Number(value) : value
        }));
    };

    return (
        <div
            className={`modal-overlay ${isOpen ? 'is-open' : 'is-closing'}`}
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
            aria-hidden={!isOpen}
        >
            <div className={`modal-content ${isOpen ? 'is-open' : 'is-closing'}`}>
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
                        />
                    </div>

                    <div className="form-group">
                        <label>Owner</label>
                        <select
                            name="ownerSelection"
                            value={ownerSelection}
                            onChange={(e) => {
                                const value = e.target.value;
                                setOwnerSelection(value);
                                if (value === 'Other') {
                                    setFormData((prev) => ({ ...prev, category: otherOwnerName }));
                                    return;
                                }
                                setFormData((prev) => ({ ...prev, category: value }));
                            }}
                            required
                        >
                            <option value="" disabled>Select owner</option>
                            <option value="Abdirahman Esse">Abdirahman Esse</option>
                            <option value="Abdiqani Yusuf">Abdiqani Yusuf</option>
                            <option value="Yahye Ali">Yahye Ali</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                    {ownerSelection === 'Other' && (
                        <div className="form-group">
                            <label>Owner Name</label>
                            <input
                                type="text"
                                name="otherOwnerName"
                                value={otherOwnerName}
                                onChange={(e) => {
                                    const value = e.target.value;
                                    setOtherOwnerName(value);
                                    setFormData((prev) => ({ ...prev, category: value }));
                                }}
                                placeholder="Enter owner name"
                                required
                            />
                        </div>
                    )}

                    <div className="form-group">
                        <label>Phone Number</label>
                        <input
                            type="text"
                            name="ownerPhone"
                            value={formData.ownerPhone || ''}
                            onChange={handleChange}
                            placeholder="enter phone number"
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>License Plate</label>
                        <input
                            type="text"
                            name="licensePlate"
                            value={formData.licensePlate}
                            onChange={handleChange}
                            required
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
                        <Button type="button" variant="danger" onClick={onClose}>
                            <X size={18} /> Cancel
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
