import { Edit, Trash2, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import type { CarProps } from '../components/CarCard'; // Reusing type
import './CarTable.css';

interface CarTableProps {
    cars: CarProps[];
    onEdit: (car: CarProps) => void;
    onDelete: (id: string) => void;
}

// Extended type for management
export interface ManagedCar extends CarProps {
    status: 'Available' | 'Rented' | 'Maintenance';
    licensePlate: string;
}

const CarTable = ({ cars, onEdit, onDelete }: CarTableProps) => {
    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'Available': return <span className="badge badge-success"><CheckCircle size={14} /> Available</span>;
            case 'Rented': return <span className="badge badge-warning"><AlertTriangle size={14} /> Rented</span>;
            case 'Maintenance': return <span className="badge badge-danger"><XCircle size={14} /> Maintenance</span>;
            default: return <span className="badge">{status}</span>;
        }
    };

    return (
        <div className="table-container">
            <table className="data-table">
                <thead>
                    <tr>
                        <th>Vehicle</th>
                        <th>Category</th>
                        <th>License Plate</th>
                        <th>Price/Day</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {cars.map((car: any) => (
                        <tr key={car.id}>
                            <td>
                                <div className="car-cell">
                                    <img src={car.image} alt={car.name} className="cell-image" />
                                    <div className="cell-info">
                                        <span className="font-medium">{car.name}</span>
                                        <span className="text-muted text-sm">{car.transmission}</span>
                                    </div>
                                </div>
                            </td>
                            <td>{car.category}</td>
                            <td>{car.licensePlate || 'ABC-1234'}</td>
                            <td>${car.pricePerDay}</td>
                            <td>{getStatusBadge(car.status || 'Available')}</td>
                            <td>
                                <div className="table-actions">
                                    <button className="action-btn edit" onClick={() => onEdit(car)} title="Edit">
                                        <Edit size={18} />
                                    </button>
                                    <button className="action-btn delete" onClick={() => onDelete(car.id)} title="Delete">
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default CarTable;
