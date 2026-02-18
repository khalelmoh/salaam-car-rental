import { Facebook, Twitter, Instagram, Mail, Phone, MapPin } from 'lucide-react';
import './Footer.css';
import { Link } from 'react-router-dom';

const Footer = () => {
    return (
        <footer className="footer">
            <div className="container footer-container">
                <div className="footer-col">
                    <h3>Salaam Car Rental</h3>
                    <p>Premium car rental services providing comfort, safety, and reliability for all your journeys.</p>
                    <div className="footer-socials">
                        <a href="#" aria-label="Facebook"><Facebook size={20} /></a>
                        <a href="#" aria-label="Twitter"><Twitter size={20} /></a>
                        <a href="#" aria-label="Instagram"><Instagram size={20} /></a>
                    </div>
                </div>

                <div className="footer-col">
                    <h4>Quick Links</h4>
                    <ul>
                        <li><Link to="/">Home</Link></li>
                        <li><Link to="/fleet">Our Fleet</Link></li>
                        <li><Link to="/about">About Us</Link></li>
                        <li><Link to="/contact">Contact</Link></li>
                    </ul>
                </div>

                <div className="footer-col">
                    <h4>Contact Us</h4>
                    <ul>
                        <li><MapPin size={16} /> 123 Freedom Street, City</li>
                        <li><Phone size={16} /> +1 234 567 8900</li>
                        <li><Mail size={16} /> info@salaamrental.com</li>
                    </ul>
                </div>
            </div>
            <div className="footer-bottom">
                <div className="container">
                    <p>&copy; {new Date().getFullYear()} Salaam Car Rental. All rights reserved.</p>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
