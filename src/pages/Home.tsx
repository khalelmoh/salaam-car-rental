import { Link } from 'react-router-dom';
import { Shield, Clock, Award, ChevronRight } from 'lucide-react';
import Button from '../components/Button';
import Input from '../components/Input';
import CarCard from '../components/CarCard';
import { cars } from '../data/cars';
import salaamLogo from '../assets/salaam-logo.png';
import './Home.css';

const Home = () => {
    const featuredCars = cars.slice(0, 3);

    return (
        <div className="home-page">
            {/* Hero Section */}
            <section className="hero">
                <div className="hero-overlay"></div>
                <div className="container hero-content">
                    <div className="hero-text">
                        <img src={salaamLogo} alt="Salaam Car Rental logo" className="hero-logo" />
                        <h1 className="hero-title">Experience the Thrill of the Road</h1>
                        <p className="hero-subtitle">Premium car rental services for your business trips and vacations. Choose from our wide range of luxury and sports cars.</p>
                        <div className="hero-actions">
                            <Link to="/fleet">
                                <Button size="lg">View Fleet</Button>
                            </Link>
                            <Button variant="outline" size="lg" className="hero-btn-outline">Learn More</Button>
                        </div>
                    </div>

                    <div className="booking-widget">
                        <h3>Quick Book</h3>
                        <div className="booking-form">
                            <Input label="Pick-up Location" placeholder="Enter city or airport" />
                            <div className="form-row">
                                <Input label="Pick-up Date" type="date" />
                                <Input label="Drop-off Date" type="date" />
                            </div>
                            <Button className="w-full">Find Car</Button>
                        </div>
                    </div>
                </div>
            </section>

            {/* Services Section */}
            <section className="section services">
                <div className="container">
                    <div className="section-header">
                        <h2>Why Choose <span className="text-highlight">Salaam</span></h2>
                        <p>We provide the best experience with our premium services</p>
                    </div>

                    <div className="services-grid">
                        <div className="service-card">
                            <div className="service-icon"><Shield size={32} /></div>
                            <h3>Secure & Safe</h3>
                            <p>All our cars are equipped with advanced safety features and are regularly inspected.</p>
                        </div>
                        <div className="service-card">
                            <div className="service-icon"><Clock size={32} /></div>
                            <h3>24/7 Support</h3>
                            <p>Our customer support team is available around the clock to assist you with any queries.</p>
                        </div>
                        <div className="service-card">
                            <div className="service-icon"><Award size={32} /></div>
                            <h3>Premium Quality</h3>
                            <p>We offer only the best vehicles from top brands to ensure a comfortable journey.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Featured Fleet Section */}
            <section className="section featured-fleet">
                <div className="container">
                    <div className="section-header">
                        <h2>Featured <span className="text-highlight">Vehicles</span></h2>
                        <div className="header-actions">
                            <Link to="/fleet" className="view-all-link">
                                View All <ChevronRight size={16} />
                            </Link>
                        </div>
                    </div>

                    <div className="grid car-grid">
                        {featuredCars.map(car => (
                            <CarCard key={car.id} car={car} />
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="cta-section">
                <div className="container cta-content">
                    <h2>Ready to hit the road?</h2>
                    <p>Book your premium vehicle today and enjoy the ride of your life.</p>
                    <Button size="lg" variant="secondary">Book Now</Button>
                </div>
            </section>
        </div>
    );
};

export default Home;
