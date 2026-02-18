import { useState } from 'react';
import { Filter } from 'lucide-react';
import CarCard from '../components/CarCard';
import Button from '../components/Button';
import { cars } from '../data/cars';
import './Fleet.css';

const Fleet = () => {
    const [activeCategory, setActiveCategory] = useState('All');

    const categories = ['All', 'Economy', 'SUV', 'Luxury', 'Sports', 'Electric'];

    const filteredCars = activeCategory === 'All'
        ? cars
        : cars.filter(car => car.category === activeCategory);

    return (
        <div className="fleet-page">
            <div className="fleet-header">
                <div className="container">
                    <h1>Our Fleet</h1>
                    <p>Choose from our selection of premium vehicles</p>
                </div>
            </div>

            <div className="container fleet-content">
                {/* Filters */}
                <div className="filters-bar">
                    <div className="filter-group">
                        <span className="filter-label"><Filter size={16} /> Category:</span>
                        <div className="category-pills">
                            {categories.map(cat => (
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
                        <select className="sort-select">
                            <option value="price-asc">Price: Low to High</option>
                            <option value="price-desc">Price: High to Low</option>
                        </select>
                    </div>
                </div>

                {/* Car Grid */}
                <div className="car-grid">
                    {filteredCars.length > 0 ? (
                        filteredCars.map(car => (
                            <CarCard key={car.id} car={car} />
                        ))
                    ) : (
                        <div className="no-results">
                            <p>No vehicles found in this category.</p>
                            <Button onClick={() => setActiveCategory('All')}>View All Cars</Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Fleet;
