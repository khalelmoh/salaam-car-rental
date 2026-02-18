import { Fuel, Gauge, Users, Settings } from 'lucide-react';
import Button from './Button';
import './CarCard.css';

export interface CarProps {
    id: string;
    name: string;
    category: string;
    image: string;
    pricePerDay: number;
    transmission: string;
    seats: number;
    fuelType: string;
    mpg: string;
}

const CarCard = ({ car }: { car: CarProps }) => {
    return (
        <div className="car-card">
            <div className="car-image-container">
                <img src={car.image} alt={car.name} className="car-image" />
                <span className="car-category">{car.category}</span>
            </div>

            <div className="car-details">
                <div className="car-header">
                    <h3>{car.name}</h3>
                    <div className="car-price">
                        <span className="price">${car.pricePerDay}</span>
                        <span className="period">/day</span>
                    </div>
                </div>

                <div className="car-specs">
                    <div className="spec-item">
                        <Settings size={16} />
                        <span>{car.transmission}</span>
                    </div>
                    <div className="spec-item">
                        <Users size={16} />
                        <span>{car.seats} Seats</span>
                    </div>
                    <div className="spec-item">
                        <Fuel size={16} />
                        <span>{car.fuelType}</span>
                    </div>
                    <div className="spec-item">
                        <Gauge size={16} />
                        <span>{car.mpg}</span>
                    </div>
                </div>

                <div className="car-actions">
                    <Button variant="outline" className="w-full">View Details</Button>
                    <Button className="w-full">Book Now</Button>
                </div>
            </div>
        </div>
    );
};

export default CarCard;
