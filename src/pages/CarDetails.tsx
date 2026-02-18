import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Check, Star } from 'lucide-react';
import Button from '../components/Button';
import { api } from '../lib/api';
import type { ManagedCar } from '../types/models';
import './CarDetails.css';

const CarDetails = () => {
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const [car, setCar] = useState<ManagedCar | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const load = async () => {
            if (!id) {
                setError('Car ID is missing.');
                setIsLoading(false);
                return;
            }
            try {
                setIsLoading(true);
                const cars = await api.listCars();
                const selected = cars.find((item) => item.id === id) || null;
                setCar(selected);
                if (!selected) {
                    setError('Car not found');
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load vehicle details.');
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, [id]);

    if (isLoading) {
        return (
            <div className="container" style={{ padding: '4rem 0', textAlign: 'center' }}>
                <h2>Loading vehicle details...</h2>
            </div>
        );
    }

    if (!car) {
        return (
            <div className="container" style={{ padding: '4rem 0', textAlign: 'center' }}>
                <h2>{error || 'Car not found'}</h2>
                <Link to="/fleet"><Button variant="outline">Back to Fleet</Button></Link>
            </div>
        );
    }

    return (
        <div className="car-details-page">
            <div className="container">
                <Link to="/fleet" className="back-link">
                    <ArrowLeft size={20} /> Back to Fleet
                </Link>

                <div className="details-grid">
                    <div className="details-image">
                        <img src={car.image} alt={car.name} />
                    </div>

                    <div className="details-info">
                        <div className="details-header">
                            <div>
                                <span className="category-tag">{car.category}</span>
                                <h1>{car.name}</h1>
                            </div>
                            <div className="price-tag">
                                <span className="amount">${car.pricePerDay}</span>
                                <span className="period">/day</span>
                            </div>
                        </div>

                        <div className="rating-row">
                            <div className="stars">
                                {[1, 2, 3, 4, 5].map((star) => (
                                    <Star key={star} size={16} fill="#d4af37" color="#d4af37" />
                                ))}
                            </div>
                            <span className="rating-text">5.0 (24 reviews)</span>
                        </div>

                        <div className="specs-list">
                            <div className="spec-row">
                                <span className="label">Transmission</span>
                                <span className="value">{car.transmission}</span>
                            </div>
                            <div className="spec-row">
                                <span className="label">Seats</span>
                                <span className="value">{car.seats} Persons</span>
                            </div>
                            <div className="spec-row">
                                <span className="label">Fuel Type</span>
                                <span className="value">{car.fuelType}</span>
                            </div>
                            <div className="spec-row">
                                <span className="label">Mileage</span>
                                <span className="value">{car.mpg}</span>
                            </div>
                        </div>

                        <div className="features-section">
                            <h3>Features</h3>
                            <ul className="features-list">
                                <li><Check size={16} /> GPS Navigation</li>
                                <li><Check size={16} /> Bluetooth / USB</li>
                                <li><Check size={16} /> Air Conditioning</li>
                                <li><Check size={16} /> Safety Airbags</li>
                                <li><Check size={16} /> Parking Sensors</li>
                            </ul>
                        </div>

                        <div className="booking-actions">
                            <Button size="lg" className="w-full" onClick={() => navigate(`/bookings?carId=${car.id}`)}>Book This Car</Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CarDetails;
