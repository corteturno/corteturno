import { loadStripe } from '@stripe/stripe-js';

// Usar la clave PÚBLICA de Stripe (pk_test_) en el frontend
const stripePromise = loadStripe('pk_test_51SpDyWFo7dpq4JuBfm7XW1delclrSp9UDiJAksRLhTqndQGis9kjxuWF16b1WgADm9PURHg68YZlbBoRn68frVB900It47sDGK');

export default stripePromise;