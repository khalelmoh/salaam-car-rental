import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X, Car } from 'lucide-react';
import Button from './Button';
import './Navbar.css';

const Navbar = () => {
    const [isOpen, setIsOpen] = useState(false);

    const toggleMenu = () => setIsOpen(!isOpen);

    return (
        <nav className="navbar">
            <div className="container navbar-container">
                <Link to="/" className="navbar-logo">
                    <Car className="navbar-logo-icon" size={28} />
                    <span>Salaam</span>
                </Link>

                {/* Mobile Menu Toggle */}
                <div className="navbar-toggle" onClick={toggleMenu}>
                    {isOpen ? <X size={24} /> : <Menu size={24} />}
                </div>

                {/* Desktop & Mobile Menu */}
                <ul className={`navbar-links ${isOpen ? 'active' : ''}`}>
                    <li><Link to="/" onClick={() => setIsOpen(false)}>Home</Link></li>
                    <li><Link to="/fleet" onClick={() => setIsOpen(false)}>Fleet</Link></li>
                    <li><Link to="/about" onClick={() => setIsOpen(false)}>About</Link></li>
                    <li><Link to="/contact" onClick={() => setIsOpen(false)}>Contact</Link></li>
                    <li className="navbar-cta">
                        <Button size="sm" variant="secondary">Book Now</Button>
                    </li>
                </ul>
            </div>
        </nav>
    );
};

export default Navbar;
