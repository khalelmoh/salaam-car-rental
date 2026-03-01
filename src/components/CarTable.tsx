import { Edit, Trash2, CheckCircle, AlertTriangle, XCircle, FileBarChart2 } from 'lucide-react';
import type { ManagedCar } from '../types/models';
import './CarTable.css';

interface CarTableProps {
    cars: ManagedCar[];
    onEdit: (car: ManagedCar) => void;
    onDelete: (id: string) => void;
    onViewReport: (car: ManagedCar) => void;
}

const CarTable = ({ cars, onEdit, onDelete, onViewReport }: CarTableProps) => {
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
                        <th>Owner</th>
                        <th>License Plate</th>
                        <th>Price/Day</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {cars.length === 0 ? (
                        <tr>
                            <td colSpan={6} className="text-muted">No vehicles found for the current filters.</td>
                        </tr>
                    ) : (
                        cars.map((car) => (
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
                                        <button className="action-btn edit" onClick={() => onEdit(car)} title="Edit" aria-label={`Edit ${car.name}`}>
                                            <Edit size={18} />
                                        </button>
                                        <button className="action-btn report" onClick={() => onViewReport(car)} title="View Report" aria-label={`View report for ${car.name}`}>
                                            <FileBarChart2 size={18} />
                                        </button>
                                        <button className="action-btn delete" onClick={() => onDelete(car.id)} title="Delete" aria-label={`Delete ${car.name}`}>
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default CarTable;
