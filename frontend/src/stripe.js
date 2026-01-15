import { loadStripe } from '@stripe/stripe-js';

// Usar la clave PÚBLICA de Stripe (pk_test_) en el frontend
const stripePromise = loadStripe('pk_test_51H2QGuCOr8psSz08uuG5yDicCREX9lkEpVdND0H9vLz2g7uaTNcYXzURmvupTz2abaIQYg5eAUUMiTNG9A3kliis00GXWJBHxQ');

export default stripePromise;