import React from 'react';
import './Input.css';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
}

const Input: React.FC<InputProps> = ({
    label,
    error,
    className = '',
    id,
    ...props
}) => {
    const inputId = id || props.name || Math.random().toString(36).substr(2, 9);

    return (
        <div className={`input-group ${className}`}>
            {label && <label htmlFor={inputId} className="input-label">{label}</label>}
            <input
                id={inputId}
                className={`input-field ${error ? 'input-error' : ''}`}
                {...props}
            />
            {error && <span className="input-error-message">{error}</span>}
        </div>
    );
};

export default Input;
