import type { CarProps } from '../components/CarCard';

export const cars: CarProps[] = [
    {
        id: '1',
        name: 'Toyota Camry',
        category: 'Economy',
        image: 'https://images.unsplash.com/photo-1621007947382-bb3c3968e3bb?auto=format&fit=crop&q=80&w=600',
        pricePerDay: 45,
        transmission: 'Automatic',
        seats: 5,
        fuelType: 'Hybrid',
        mpg: '52 MPG'
    },
    {
        id: '2',
        name: 'BMW X5',
        category: 'SUV',
        image: 'https://images.unsplash.com/photo-1556189250-72ba9540536d?auto=format&fit=crop&q=80&w=600',
        pricePerDay: 85,
        transmission: 'Automatic',
        seats: 5,
        fuelType: 'Diesel',
        mpg: '26 MPG'
    },
    {
        id: '3',
        name: 'Mercedes-Benz S-Class',
        category: 'Luxury',
        image: 'https://images.unsplash.com/photo-1617788138017-80ad40651399?auto=format&fit=crop&q=80&w=600',
        pricePerDay: 150,
        transmission: 'Automatic',
        seats: 5,
        fuelType: 'Petrol',
        mpg: '22 MPG'
    },
    {
        id: '4',
        name: 'Ford Mustang',
        category: 'Sports',
        image: 'https://images.unsplash.com/photo-1584345604476-8ec5e12e42dd?auto=format&fit=crop&q=80&w=600',
        pricePerDay: 95,
        transmission: 'Manual',
        seats: 4,
        fuelType: 'Petrol',
        mpg: '20 MPG'
    },
    {
        id: '5',
        name: 'Tesla Model 3',
        category: 'Electric',
        image: 'https://images.unsplash.com/photo-1560958089-b8a1929cea89?auto=format&fit=crop&q=80&w=600',
        pricePerDay: 75,
        transmission: 'Automatic',
        seats: 5,
        fuelType: 'Electric',
        mpg: '140 MPGe'
    },
    {
        id: '6',
        name: 'Range Rover Sport',
        category: 'SUV',
        image: 'https://images.unsplash.com/photo-1606611013016-969c19ba27bb?auto=format&fit=crop&q=80&w=600',
        pricePerDay: 110,
        transmission: 'Automatic',
        seats: 5,
        fuelType: 'Petrol',
        mpg: '19 MPG'
    }
];
