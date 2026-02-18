import { useEffect, useMemo, useState } from 'react';
import { Filter } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import CarCard from '../components/CarCard';
import Button from '../components/Button';
import { api } from '../lib/api';
import type { ManagedCar } from '../types/models';
import './Fleet.css';

type SortOption = 'price-asc' | 'price-desc';

const Fleet = () => {
    const navigate = useNavigate();
    const [activeCategory, setActiveCategory] = useState('All');
    const [sortBy, setSortBy] = useState<SortOption>('price-asc');
    const [cars, setCars] = useState<ManagedCar[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const loadCars = async () => {
            setError('');
            setIsLoading(true);
            try {
                const data = await api.listCars();
                setCars(data);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load fleet.');
            } finally {
                setIsLoading(false);
            }
        };
        loadCars();
    }, []);

    const categories = useMemo(() => {
        const all = new Set(['All']);
        for (const car of cars) {
            all.add(car.category);
        }
        return Array.from(all);
    }, [cars]);

    const filteredCars = useMemo(() => {
        const scoped = activeCategory === 'All'
            ? cars
            : cars.filter((car) => car.category === activeCategory);

        return [...scoped].sort((a, b) => {
            if (sortBy === 'price-asc') return a.pricePerDay - b.pricePerDay;
            return b.pricePerDay - a.pricePerDay;
        });
    }, [activeCategory, cars, sortBy]);

    const handleViewDetails = (carId: string) => {
        navigate(`/fleet/${carId}`);
    };

    const handleBookNow = (carId: string) => {
        navigate(`/bookings?carId=${carId}`);
    };

    return (
        <div className="fleet-page">
            <div className="fleet-header">
                <div className="container">
                    <h1>Our Fleet</h1>
                    <p>Choose from our selection of premium vehicles</p>
                </div>
            </div>

            <div className="container fleet-content">
                <div className="filters-bar">
                    <div className="filter-group">
                        <span className="filter-label"><Filter size={16} /> Category:</span>
                        <div className="category-pills">
                            {categories.map((cat) => (
                                <button
                                    key={cat}
                                    className={`category-pill ${activeCategory === cat ? 'active' : ''}`}
                                    onClick={() => setActiveCategory(cat)}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="sort-group">
                        <select className="sort-select" value={sortBy} onChange={(e) => setSortBy(e.target.value as SortOption)}>
                            <option value="price-asc">Price: Low to High</option>
                            <option value="price-desc">Price: High to Low</option>
                        </select>
                    </div>
                </div>

                {isLoading && <div className="no-results"><p>Loading fleet...</p></div>}
                {error && <div className="no-results"><p>{error}</p></div>}

                {!isLoading && !error && (
                    <div className="car-grid">
                        {filteredCars.length > 0 ? (
                            filteredCars.map((car) => (
                                <CarCard
                                    key={car.id}
                                    car={car}
                                    onViewDetails={handleViewDetails}
                                    onBookNow={handleBookNow}
                                />
                            ))
                        ) : (
                            <div className="no-results">
                                <p>No vehicles found in this category.</p>
                                <Button onClick={() => setActiveCategory('All')}>View All Cars</Button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Fleet;
