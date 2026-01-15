import React, { useState, useEffect } from 'react';
import { Calendar, Users, Scissors, TrendingUp, Settings, LogOut, Plus, X, Check, Clock, DollarSign, User, Mail, Lock, Building, ChevronRight, Trash2, Eye, EyeOff, Play, ChevronDown, Bell } from 'lucide-react';
import { DayPicker } from "react-day-picker";
import 'react-day-picker/dist/style.css';
import { format } from "date-fns";
import { es } from "date-fns/locale";
import logo from './assets/logo.png';
import banner from './assets/banner.png';
import video from './assets/comoseusa.mp4';
import './calendar-styles.css';
import PublicBooking from './PublicBooking.jsx';
import io from 'socket.io-client';
import stripePromise from './stripe.js';

// =====================================================
// CONFIGURACIÓN DEL BACKEND
// =====================================================
const API_URL = '/api';

// Clase para manejar llamadas al backend
class API {
  static async call(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers
    };

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Error en la petición');
    }

    return response.json();
  }
}

const BarberShopSaaS = () => {
  // Check if this is a public booking URL
  const urlPath = window.location.pathname;
  const isPublicBooking = urlPath.startsWith('/book/');
  
  if (isPublicBooking) {
    const pathParts = urlPath.split('/');
    const branchId = pathParts[2];
    const chairId = pathParts[3];
    
    if (branchId && chairId) {
      return <PublicBooking branchId={branchId} chairId={chairId} />;
    }
  }
  const [currentUser, setCurrentUser] = useState(null);
  const [view, setView] = useState(() => localStorage.getItem('barberos_view') || 'loading');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Estado de onboarding
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [onboardingData, setOnboardingData] = useState({
    shopName: '',
    branches: [{ name: '', workDays: [], startTime: '09:00', endTime: '18:00', lunchStart: '14:00', lunchEnd: '15:00', chairs: [{ number: 1, commission: 15 }, { number: 2, commission: 15 }] }],
    services: [{ name: '', price: '', duration: 30 }],
    commissionsEnabled: false
  });

  // Estado de la aplicación
  const [appointments, setAppointments] = useState([]);
  const [branches, setBranches] = useState([]);
  const [users, setUsers] = useState([]);
  const [services, setServices] = useState([]);
  const [metrics, setMetrics] = useState({ todayAppts: 0, completed: 0, noShows: 0, revenue: 0 });
  const [selectedBranch, setSelectedBranch] = useState(() => localStorage.getItem('barberos_selectedBranch') || null);
  const [selectedDate, setSelectedDate] = useState(() => {
    const savedDate = localStorage.getItem('barberos_selectedDate');
    const savedTimestamp = localStorage.getItem('barberos_selectedDate_timestamp');
    
    // Si hay fecha guardada y no han pasado más de 2 horas, usarla
    if (savedDate && savedTimestamp && (Date.now() - parseInt(savedTimestamp)) <= 2 * 60 * 60 * 1000) {
      return savedDate;
    }
    
    // Si no, usar fecha actual del navegador (más compatible)
    return new Date().toISOString().split('T')[0];
  });
  const [showModal, setShowModal] = useState(false);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [rescheduleAppointmentData, setRescheduleAppointmentData] = useState(null);
  const [adminView, setAdminView] = useState('main');
  const [editingItem, setEditingItem] = useState(null);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [expandedChairs, setExpandedChairs] = useState({});
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelAppointmentId, setCancelAppointmentId] = useState(null);
  const [showOverdueModal, setShowOverdueModal] = useState(false);
  const [overdueAppointment, setOverdueAppointment] = useState(null);
  const [showMetricsModal, setShowMetricsModal] = useState(false);
  const [metricsModalType, setMetricsModalType] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showCommissionModal, setShowCommissionModal] = useState(false);
  const [showRankingModal, setShowRankingModal] = useState(false);
  const [currentChairIndex, setCurrentChairIndex] = useState(0);
  const [showQRModal, setShowQRModal] = useState(false);
  const [selectedChairForQR, setSelectedChairForQR] = useState(null);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [notificationData, setNotificationData] = useState(null);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState({ plan: 'free', daysLeft: 15 });
  const [showExpirationModal, setShowExpirationModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Form states
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ email: '', password: '', name: '' });
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    checkAuth();
    registerServiceWorker();
    checkSubscriptionStatus();
    
    // Check for payment success/cancel from URL
    const urlParams = new URLSearchParams(window.location.search);
    const payment = urlParams.get('payment');
    if (payment === 'success') {
      setShowSuccessModal(true);
      // Force refresh subscription status multiple times
      setTimeout(() => checkSubscriptionStatus(), 1000);
      setTimeout(() => checkSubscriptionStatus(), 3000);
      setTimeout(() => checkSubscriptionStatus(), 5000);
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Register service worker for push notifications
  const registerServiceWorker = async () => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        console.log('Service Worker registered:', registration);
        
        // Request notification permission
        if (Notification.permission === 'default') {
          await Notification.requestPermission();
        }
      } catch (error) {
        console.error('Service Worker registration failed:', error);
      }
    }
  };

  // Check subscription status
  const checkSubscriptionStatus = async () => {
    try {
      const data = await API.call('/stripe/subscription-status');
      setSubscriptionStatus(data);
      
      // Show expiration modal if 2 days left and pro
      if (data.plan === 'pro' && data.daysLeft <= 2 && data.daysLeft > 0) {
        setShowExpirationModal(true);
      }
    } catch (err) {
      console.error('Error checking subscription:', err);
    }
  };

  // Upgrade to Pro with Stripe
  const upgradeToPro = async () => {
    try {
      setLoading(true);
      console.log('🔄 Starting Stripe checkout process...');
      
      // Create checkout session
      const response = await API.call('/stripe/create-checkout-session', { 
        method: 'POST',
        body: JSON.stringify({
          successUrl: `${window.location.origin}?payment=success`,
          cancelUrl: `${window.location.origin}?payment=cancelled`
        })
      });
      
      console.log('✅ Checkout session created:', response.sessionId);
      console.log('✅ Checkout URL:', response.url);
      
      // Redirect to Stripe Checkout
      if (response.url) {
        window.location.href = response.url;
      } else {
        throw new Error('No se recibió URL de checkout');
      }
      
    } catch (err) {
      console.error('❌ Upgrade error:', err);
      setError('Error al procesar el pago: ' + err.message);
      setLoading(false);
    }
  };

  // Show push notification
  const showPushNotification = (notification) => {
    if (Notification.permission === 'granted' && 'serviceWorker' in navigator) {
      const { data, type } = notification;
      let title, body, icon;
      
      switch (type) {
        case 'public_booking':
          title = '🆕 Nueva Cita Agendada';
          body = `${data.clientName} agendó ${data.serviceName} para ${data.time} en Silla ${data.chairNumber}`;
          icon = '🎆';
          break;
        case 'appointment_rescheduled':
          title = '📅 Cita Reagendada';
          body = `${data.clientName} reagendó su cita de ${data.serviceName} para ${data.time}`;
          icon = '📅';
          break;
        case 'appointment_cancelled':
          title = '❌ Cita Cancelada';
          body = `${data.clientName} canceló su cita de ${data.serviceName} en Silla ${data.chairNumber}`;
          icon = '❌';
          break;
        default:
          title = 'Notificación';
          body = 'Nueva actividad en tu barbería';
          icon = '🔔';
      }
      
      navigator.serviceWorker.ready.then(registration => {
        registration.showNotification(title, {
          body,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          vibrate: [200, 100, 200],
          requireInteraction: true,
          tag: `barbershop-${notification.branchId}-${Date.now()}`,
          data: {
            branchId: notification.branchId,
            type: notification.type
          }
        });
      });
    }
  };

  // Setup socket connection after user is authenticated
  useEffect(() => {
    if (currentUser?.tenant_id && selectedBranch) {
      console.log('🔌 Setting up Socket.IO for tenant:', currentUser.tenant_id, 'branch:', selectedBranch);
      
      // Conectar al backend (mismo origen)
      const socket = io({
        transports: ['websocket', 'polling'],
        upgrade: true,
        rememberUpgrade: true,
        timeout: 20000,
        forceNew: true
      });
      
      // Guardar socket globalmente para testing
      window.testSocket = socket;
      
      socket.on('connect', () => {
        console.log('✅ Socket connected:', socket.id);
        console.log('🔗 Socket transport:', socket.io.engine.transport.name);
        
        // Join tenant room
        socket.emit('join-tenant', currentUser.tenant_id);
        // Join specific branch room for targeted notifications
        socket.emit('join-branch', selectedBranch);
        console.log(`🏪 Joined rooms: tenant-${currentUser.tenant_id}, branch-${selectedBranch}`);
      });
      
      socket.on('joined-tenant', (data) => {
        console.log('✅ Confirmed joined tenant:', data);
      });
      
      socket.on('joined-branch', (data) => {
        console.log('✅ Confirmed joined branch:', data);
      });
      
      socket.on('connect_error', (error) => {
        console.error('❌ Socket connection error:', error);
        console.error('❌ Error details:', error.message, error.type);
      });
      
      socket.on('disconnect', (reason) => {
        console.log('🔌 Socket disconnected:', reason);
      });
      
      socket.on('notification', (notification) => {
        console.log('🔔 Notification received:', notification);
        console.log('🔔 Current branch:', selectedBranch);
        console.log('🔔 Notification branch:', notification.branchId);
        
        // Only show notifications for the current branch OR if it's a test
        if (notification.branchId === selectedBranch || notification.type === 'test') {
          console.log('✅ Showing notification for current branch');
          setNotificationData(notification.data);
          setShowNotificationModal(true);
          showPushNotification(notification);
          
          // Refresh appointments only
          setTimeout(async () => {
            console.log('🔄 Refreshing appointments after notification');
            if (selectedBranch) {
              const appointmentsData = await API.call(`/appointments?branch=${selectedBranch}`);
              setAppointments(appointmentsData || []);
            }
          }, 1000);
        } else {
          console.log('😫 Notification ignored - different branch:', notification.branchId, 'vs', selectedBranch);
        }
      });
      
      // Test connection after 2 seconds (deshabilitado en producción)
      // if (process.env.NODE_ENV === 'development') {
      //   setTimeout(() => {
      //     console.log('🧪 Testing Socket.IO connection...');
      //     socket.emit('test-notification', {
      //       tenantId: currentUser.tenant_id,
      //       branchId: selectedBranch
      //     });
      //   }, 2000);
      // }
      
      return () => {
        console.log('🔌 Disconnecting socket');
        window.testSocket = null;
        socket.disconnect();
      };
    }
  }, [currentUser?.tenant_id, selectedBranch]);

  useEffect(() => {
    if (selectedBranch) {
      localStorage.setItem('barberos_selectedBranch', selectedBranch);
      console.log('Branch changed, loading data for:', selectedBranch);
      loadBranchData(selectedBranch);
    }
  }, [selectedBranch]);

  useEffect(() => {
    localStorage.setItem('barberos_selectedDate', selectedDate);
    localStorage.setItem('barberos_selectedDate_timestamp', Date.now().toString());
    if (selectedBranch) {
      console.log('Date changed, reloading appointments for:', selectedDate);
      loadBranchData(selectedBranch);
    }
  }, [selectedDate]);

  const checkAuth = async () => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const data = await API.call('/auth/me');
        setCurrentUser(data.user);
        if (!data.user.onboarded) {
          setView('onboarding');
        } else {
          const savedView = localStorage.getItem('barberos_view');
          setView(savedView && ['dashboard', 'appointments', 'admin'].includes(savedView) ? savedView : 'dashboard');
          await loadUserData();
          await checkSubscriptionStatus();
        }
      } catch (err) {
        localStorage.removeItem('token');
        setView('login');
        setShowWelcomeModal(true);
      }
    } else {
      setView('login');
      setShowWelcomeModal(true);
    }
  };

  const loadUserData = async () => {
    try {
      const [branchesData, servicesData, usersData] = await Promise.all([
        API.call('/branches'),
        API.call('/services'),
        API.call('/users')
      ]);

      setBranches(branchesData || []);
      setServices(servicesData || []);
      setUsers(usersData || []);
      
      if (branchesData && branchesData.length > 0) {
        const savedBranch = localStorage.getItem('barberos_selectedBranch');
        const validBranch = savedBranch && branchesData.find(b => b.id === savedBranch);
        const branchToSelect = validBranch ? savedBranch : branchesData[0].id;
        setSelectedBranch(branchToSelect);
        // Forzar carga de datos inmediatamente
        await loadBranchData(branchToSelect);
      }
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Error al cargar datos: ' + err.message);
    }
  };

  const loadBranchData = async (branchId = selectedBranch) => {
    if (!branchId) return;
    
    try {
      console.log('🔄 Loading branch data for:', branchId, 'date:', selectedDate);
      
      // Cargar citas SIN filtro de fecha para obtener todas las citas de la sucursal
      console.log('📞 Calling /appointments API...');
      const appointmentsData = await API.call(`/appointments?branch=${branchId}`);
      console.log('📊 Raw appointments data received:', appointmentsData?.length || 0, appointmentsData);
      
      // Cargar métricas CON filtro de fecha
      console.log('📞 Calling /metrics API...');
      const metricsData = await API.call(`/metrics?branch=${branchId}&date=${selectedDate}`);
      console.log('📈 Metrics data received:', metricsData);
      
      setAppointments(appointmentsData || []);
      setMetrics(metricsData || { todayAppts: 0, completed: 0, noShows: 0, revenue: 0 });
    } catch (err) {
      console.error('❌ Error loading branch data:', err);
      setError('Error al cargar datos de la sucursal: ' + err.message);
    }
  };

  const handleRegister = async () => {
    if (!registerForm.email || !registerForm.password || !registerForm.name) {
      setError('Completa todos los campos');
      return;
    }
    setLoading(true);
    setError('');
    
    try {
      const data = await API.call('/auth/register', {
        method: 'POST',
        body: JSON.stringify(registerForm)
      });

      localStorage.setItem('token', data.token);
      setCurrentUser(data.user);
      // Reset onboarding state for new user
      setOnboardingStep(0);
      setShowModal(false); // Cerrar cualquier modal abierto
      setOnboardingData({
        shopName: '',
        branches: [{ name: '', workDays: [], startTime: '09:00', endTime: '18:00', lunchStart: '14:00', lunchEnd: '15:00', chairs: [{ number: 1, commission: 15 }, { number: 2, commission: 15 }] }],
        services: [{ name: '', price: '', duration: 30 }],
        commissionsEnabled: false
      });
      setView('onboarding');
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleLogin = async () => {
    setLoading(true);
    setError('');
    
    try {
      const data = await API.call('/auth/login', {
        method: 'POST',
        body: JSON.stringify(loginForm)
      });

      localStorage.setItem('token', data.token);
      setCurrentUser(data.user);
      
      if (!data.user.onboarded) {
        setView('onboarding');
      } else {
        const savedView = localStorage.getItem('barberos_view');
        setView(savedView && ['dashboard', 'appointments', 'admin'].includes(savedView) ? savedView : 'dashboard');
        setShowWelcomeModal(false);
        await loadUserData();
      }
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setCurrentUser(null);
    setView('login');
    setLoginForm({ email: '', password: '' });
    setRegisterForm({ email: '', password: '', name: '' });
    setBranches([]);
    setServices([]);
    setAppointments([]);
    setUsers([]);
    setMetrics({ todayAppts: 0, completed: 0, noShows: 0, revenue: 0 });
    setSelectedBranch(null);
    setShowModal(false);
    setShowWelcomeModal(false);
    setError('');
    // Reset onboarding state
    setOnboardingStep(0);
    setOnboardingData({
      shopName: '',
      branches: [{ name: '', workDays: [], startTime: '09:00', endTime: '18:00', lunchStart: '14:00', lunchEnd: '15:00', chairs: [{ number: 1, commission: 15 }, { number: 2, commission: 15 }] }],
      services: [{ name: '', price: '', duration: 30 }],
      commissionsEnabled: false
    });
  };

  const completeOnboarding = async () => {
    setLoading(true);
    setError('');
    
    try {
      await API.call('/onboarding/complete', {
        method: 'POST',
        body: JSON.stringify(onboardingData)
      });

      const updatedUser = { ...currentUser, onboarded: true };
      setCurrentUser(updatedUser);
      setShowWelcomeModal(false);
      localStorage.setItem('barberos_view', 'dashboard');
      setView('dashboard');
      await loadUserData();
    } catch (err) {
      setError('Error al completar configuración: ' + err.message);
    }
    setLoading(false);
  };

  const createAppointment = async (appointmentData) => {
    setLoading(true);
    setError('');
    
    try {
      await API.call('/appointments', {
        method: 'POST',
        body: JSON.stringify({
          branchId: appointmentData.branchId,
          chairId: appointmentData.chairId,
          serviceId: appointmentData.serviceId,
          clientName: appointmentData.clientName,
          clientPhone: appointmentData.clientPhone,
          date: appointmentData.date,
          time: appointmentData.time
        })
      });

      await loadUserData();
      setShowModal(false);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  // Función para generar horarios disponibles
  const generateAvailableTimeSlots = async (selectedDate, selectedChairId, selectedServiceId) => {
    if (!selectedBranchData || !selectedDate || !selectedChairId || !selectedServiceId) {
      return [];
    }

    try {
      const response = await API.call(
        `/available-times?date=${selectedDate}&branchId=${selectedBranch}&chairId=${selectedChairId}&serviceId=${selectedServiceId}`
      );
      return response;
    } catch (error) {
      console.error('Error obteniendo horarios:', error);
      return [];
    }
  };

  const updateAppointmentStatus = async (id, status) => {
    try {
      await API.call(`/appointments/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });

      await loadUserData();
    } catch (err) {
      setError('Error al actualizar cita: ' + err.message);
    }
  };

  const rescheduleAppointment = async (id, newDate, newTime) => {
    try {
      await API.call(`/appointments/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ 
          appointment_date: newDate,
          appointment_time: newTime
        })
      });
      await loadUserData();
    } catch (err) {
      setError('Error al reagendar cita: ' + err.message);
    }
  };

  const cancelAppointment = async (id) => {
    try {
      await API.call(`/appointments/${id}`, {
        method: 'DELETE'
      });
      await loadUserData();
    } catch (err) {
      setError('Error al cancelar cita: ' + err.message);
    }
  };

  // CRUD Functions
  const createBranch = async (branchData) => {
    try {
      await API.call('/branches', {
        method: 'POST',
        body: JSON.stringify(branchData)
      });
      await loadUserData();
      setShowAdminModal(false);
      setEditingItem(null);
    } catch (err) {
      setError('Error al crear sucursal: ' + err.message);
    }
  };

  const updateBranch = async (id, branchData) => {
    try {
      await API.call(`/branches/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(branchData)
      });
      await loadUserData();
      setShowAdminModal(false);
      setEditingItem(null);
    } catch (err) {
      setError('Error al actualizar sucursal: ' + err.message);
    }
  };

  const deleteBranch = async (id) => {
    try {
      await API.call(`/branches/${id}`, { method: 'DELETE' });
      await loadUserData();
    } catch (err) {
      setError('Error al eliminar sucursal: ' + err.message);
    }
  };

  const createService = async (serviceData) => {
    try {
      await API.call('/services', {
        method: 'POST',
        body: JSON.stringify(serviceData)
      });
      await loadUserData();
      setShowAdminModal(false);
      setEditingItem(null);
    } catch (err) {
      setError('Error al crear servicio: ' + err.message);
    }
  };

  const updateService = async (id, serviceData) => {
    try {
      await API.call(`/services/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(serviceData)
      });
      await loadUserData();
      setShowAdminModal(false);
      setEditingItem(null);
    } catch (err) {
      setError('Error al actualizar servicio: ' + err.message);
    }
  };

  const deleteService = async (id) => {
    try {
      await API.call(`/services/${id}`, { method: 'DELETE' });
      await loadUserData();
    } catch (err) {
      setError('Error al eliminar servicio: ' + err.message);
    }
  };

  const updateUser = async (id, userData) => {
    try {
      await API.call(`/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(userData)
      });
      await loadUserData();
      setShowAdminModal(false);
      setEditingItem(null);
    } catch (err) {
      setError('Error al actualizar usuario: ' + err.message);
    }
  };

  const deleteUser = async (id) => {
    try {
      await API.call(`/users/${id}`, { method: 'DELETE' });
      await loadUserData();
    } catch (err) {
      setError('Error al eliminar usuario: ' + err.message);
    }
  };

  // Componente del modal de métricas
  const MetricsModal = () => {
    const extendedMetrics = getExtendedMetrics();
    const isBlackModal = metricsModalType === 'appointments';
    
    const getMetricValue = (period, type) => {
      switch (type) {
        case 'appointments': return extendedMetrics[period].total;
        case 'completed': return extendedMetrics[period].completed;
        case 'noShows': return extendedMetrics[period].noShows;
        case 'revenue': return extendedMetrics[period].revenue;
        default: return 0;
      }
    };
    
    const getTitle = () => {
      switch (metricsModalType) {
        case 'appointments': return 'Citas Programadas';
        case 'completed': return 'Citas Completadas';
        case 'noShows': return 'Citas No Show';
        case 'revenue': return 'Ingresos Generados';
        default: return 'Métricas';
      }
    };
    
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
        <div className={`rounded-3xl p-6 w-full max-w-sm mx-auto shadow-2xl transform transition-all duration-300 scale-100 ${
          isBlackModal ? 'bg-black text-white' : 'bg-white text-black'
        }`}>
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold">{getTitle()}</h3>
            <button 
              onClick={() => {
                setShowMetricsModal(false);
                setMetricsModalType(null);
              }} 
              className={`p-2 rounded-xl ${
                isBlackModal ? 'active:bg-white/10' : 'active:bg-gray-100'
              }`}
            >
              <X className={`w-5 h-5 ${isBlackModal ? 'text-white' : 'text-gray-500'}`} />
            </button>
          </div>
          
          <div className="space-y-4">
            {[
              { label: 'Ayer', period: 'yesterday' },
              { label: 'Hoy', period: 'today' },
              { label: 'Esta Semana', period: 'week' },
              { label: 'Este Mes', period: 'month' }
            ].map(({ label, period }) => (
              <div key={period} className={`flex justify-between items-center py-3 border-b ${
                isBlackModal ? 'border-white/20' : 'border-gray-200'
              }`}>
                <span className={`font-medium ${
                  isBlackModal ? 'text-white/80' : 'text-gray-600'
                }`}>{label}</span>
                <span className="font-bold text-lg">
                  {metricsModalType === 'revenue' ? '$' : ''}
                  {getMetricValue(period, metricsModalType)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };
  const OverdueModal = () => {
    const handleOverdueAction = async (status) => {
      setLoading(true);
      try {
        await updateAppointmentStatus(overdueAppointment.id, status);
        setShowOverdueModal(false);
        setOverdueAppointment(null);
      } catch (err) {
        setError(err.message);
      }
      setLoading(false);
    };

    const service = services.find(s => s.id === overdueAppointment?.service_id);

    return (
      <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-6 w-full max-w-sm mx-auto shadow-2xl">
          <div className="text-center mb-6">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-orange-100 flex items-center justify-center">
              <Clock className="w-8 h-8 text-orange-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              Cita vencida
            </h3>
            <p className="text-gray-600 text-sm mb-2">
              La cita de <strong>{overdueAppointment?.client_name}</strong> para {service?.name} ya pasó su horario.
            </p>
            <p className="text-orange-600 text-sm font-medium">
              ¿Cómo terminó la cita?
            </p>
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={() => handleOverdueAction('no-show')}
              disabled={loading}
              className="flex-1 bg-red-500 text-white py-3 rounded-xl font-semibold text-sm active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {loading ? 'Procesando...' : 'No asistió'}
            </button>
            <button
              onClick={() => handleOverdueAction('completed')}
              disabled={loading}
              className="flex-1 bg-green-500 text-white py-3 rounded-xl font-semibold text-sm active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {loading ? 'Procesando...' : 'Completada'}
            </button>
          </div>
        </div>
      </div>
    );
  };
  const CancelModal = () => {
    const handleCancel = async () => {
      setLoading(true);
      try {
        await cancelAppointment(cancelAppointmentId);
        setShowCancelModal(false);
        setCancelAppointmentId(null);
      } catch (err) {
        setError(err.message);
      }
      setLoading(false);
    };

    return (
      <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-6 w-full max-w-sm mx-auto shadow-2xl">
          <div className="text-center mb-6">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
              <Trash2 className="w-8 h-8 text-red-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              Cancelar cita
            </h3>
            <p className="text-gray-600 text-sm mb-1">
              ¿Estás seguro de cancelar esta cita?
            </p>
            <p className="text-red-500 text-xs font-medium">
              Esta acción no se puede deshacer
            </p>
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={() => {
                setShowCancelModal(false);
                setCancelAppointmentId(null);
              }}
              className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-semibold text-sm active:bg-gray-200 transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={handleCancel}
              disabled={loading}
              className="flex-1 bg-red-500 text-white py-3 rounded-xl font-semibold text-sm active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {loading ? 'Procesando...' : 'Confirmar'}
            </button>
          </div>
        </div>
      </div>
    );
  };
  const ConfirmModal = () => {
    const handleConfirm = async () => {
      setLoading(true);
      try {
        await updateAppointmentStatus(confirmAction.appointmentId, confirmAction.status);
        setShowConfirmModal(false);
        setConfirmAction(null);
      } catch (err) {
        setError(err.message);
      }
      setLoading(false);
    };

    return (
      <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-6 w-full max-w-sm mx-auto shadow-2xl">
          <div className="text-center mb-6">
            <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${
              confirmAction?.status === 'completed' ? 'bg-green-100' : 'bg-red-100'
            }`}>
              {confirmAction?.status === 'completed' ? (
                <Check className={`w-8 h-8 text-green-600`} />
              ) : (
                <X className={`w-8 h-8 text-red-600`} />
              )}
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              {confirmAction?.status === 'completed' ? 'Marcar como completada' : 'Marcar como no asistió'}
            </h3>
            <p className="text-gray-600 text-sm mb-1">
              ¿Estás seguro de cambiar el estado de esta cita?
            </p>
            <p className="text-red-500 text-xs font-medium">
              Esta acción no se puede deshacer
            </p>
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={() => {
                setShowConfirmModal(false);
                setConfirmAction(null);
              }}
              className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-semibold text-sm active:bg-gray-200 transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading}
              className={`flex-1 py-3 rounded-xl font-semibold text-sm active:scale-[0.98] transition-all disabled:opacity-50 ${
                confirmAction?.status === 'completed' 
                  ? 'bg-green-500 text-white' 
                  : 'bg-red-500 text-white'
              }`}
            >
              {loading ? 'Procesando...' : 'Confirmar'}
            </button>
          </div>
        </div>
      </div>
    );
  };
  const RescheduleModal = () => {
    const [formData, setFormData] = useState({
      date: rescheduleAppointmentData?.appointment_date?.split('T')[0] || selectedDate,
      time: rescheduleAppointmentData?.appointment_time || ''
    });
    const [availableTimeSlots, setAvailableTimeSlots] = useState([]);
    const [loadingTimes, setLoadingTimes] = useState(false);

    useEffect(() => {
      const loadAvailableTimes = async () => {
        if (formData.date && rescheduleAppointmentData) {
          setLoadingTimes(true);
          try {
            const times = await generateAvailableTimeSlots(
              formData.date,
              rescheduleAppointmentData.chair_id,
              rescheduleAppointmentData.service_id
            );
            setAvailableTimeSlots(times);
          } catch (error) {
            console.error('Error cargando horarios:', error);
            setAvailableTimeSlots([]);
          }
          setLoadingTimes(false);
        }
      };
      loadAvailableTimes();
    }, [formData.date]);

    const handleSubmit = async (e) => {
      e.preventDefault();
      setLoading(true);
      try {
        await rescheduleAppointment(rescheduleAppointmentData.id, formData.date, formData.time);
        setShowRescheduleModal(false);
        setRescheduleAppointmentData(null);
      } catch (err) {
        setError(err.message);
      }
      setLoading(false);
    };

    return (
      <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-2">
        <div className="bg-white rounded-2xl p-4 w-full max-w-sm max-h-[75vh] overflow-y-auto shadow-2xl">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-gray-900">Reagendar cita</h3>
            <button 
              onClick={() => {
                setShowRescheduleModal(false);
                setRescheduleAppointmentData(null);
              }} 
              className="p-2 active:bg-gray-100 rounded-xl"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          <div className="mb-4 p-3 bg-gray-50 rounded-xl">
            <p className="font-medium text-gray-900">{rescheduleAppointmentData?.client_name}</p>
            <p className="text-sm text-gray-500">{services.find(s => s.id === rescheduleAppointmentData?.service_id)?.name}</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700">Nueva fecha</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={e => setFormData({...formData, date: e.target.value, time: ''})}
                  required
                  className="w-full bg-gray-50 rounded-xl p-3 outline-none text-gray-900 border border-gray-300"
                />
              </div>

              {formData.date && (
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700">Nuevo horario</label>
                  {loadingTimes ? (
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-black mx-auto mb-2"></div>
                      <p className="text-gray-500 text-sm">Cargando horarios...</p>
                    </div>
                  ) : availableTimeSlots.length === 0 ? (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-center">
                      <p className="text-yellow-600 text-sm font-medium">
                        No hay horarios disponibles para esta fecha
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                      {availableTimeSlots.map(slot => (
                        <button
                          key={slot.time}
                          type="button"
                          onClick={() => setFormData({...formData, time: slot.time})}
                          className={`p-3 rounded-xl text-sm font-medium transition-all ${
                            formData.time === slot.time
                              ? 'bg-black text-white shadow-sm'
                              : 'bg-gray-50 text-gray-700 border border-gray-300 hover:bg-gray-100'
                          }`}
                        >
                          {slot.display}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-red-600 text-sm font-medium">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !formData.time}
                className="w-full bg-black text-white py-3.5 rounded-xl font-semibold text-base active:scale-[0.98] transition-all disabled:opacity-50 shadow-sm"
              >
                {loading ? 'Reagendando...' : 'Reagendar cita'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  // Componente del modal de administración
  const AdminModal = () => {
    const [formData, setFormData] = useState(() => {
      if (adminView === 'branches') {
        return editingItem ? {
          name: editingItem.name || '',
          workDays: editingItem.work_days || [],
          startTime: editingItem.start_time || '09:00',
          endTime: editingItem.end_time || '18:00',
          lunchStart: editingItem.lunch_start || '14:00',
          lunchEnd: editingItem.lunch_end || '15:00',
          chairs: editingItem.chairs?.map(c => ({ number: c.chair_number, commission: c.commission || 15 })) || [{ number: 1, commission: 15 }, { number: 2, commission: 15 }],
          commissionsEnabled: editingItem.commissions_enabled || false
        } : {
          name: '', workDays: [], startTime: '09:00', endTime: '18:00',
          lunchStart: '14:00', lunchEnd: '15:00', chairs: [{ number: 1, commission: 15 }, { number: 2, commission: 15 }],
          commissionsEnabled: false
        };
      } else if (adminView === 'services') {
        return editingItem ? {
          name: editingItem.name || '',
          price: editingItem.price || '',
          duration: editingItem.duration || 30
        } : { name: '', price: '', duration: 30 };
      } else if (adminView === 'users') {
        return editingItem ? {
          name: editingItem.name || '',
          email: editingItem.email || '',
          role: editingItem.role || 'user'
        } : { name: '', email: '', role: 'user' };
      }
      return {};
    });

    const handleSubmit = async (e) => {
      e.preventDefault();
      setLoading(true);
      try {
        if (adminView === 'branches') {
          if (editingItem) {
            await updateBranch(editingItem.id, formData);
          } else {
            await createBranch(formData);
          }
        } else if (adminView === 'services') {
          if (editingItem) {
            await updateService(editingItem.id, formData);
          } else {
            await createService(formData);
          }
        } else if (adminView === 'users') {
          await updateUser(editingItem.id, formData);
        }
      } catch (err) {
        setError(err.message);
      }
      setLoading(false);
    };

    const getTitle = () => {
      const action = editingItem ? 'Editar' : 'Crear';
      if (adminView === 'branches') return `${action} Sucursal`;
      if (adminView === 'services') return `${action} Servicio`;
      if (adminView === 'users') return 'Editar Usuario';
      return 'Administrar';
    };

    return (
      <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-2">
        <div className="bg-white rounded-2xl p-4 w-full max-w-sm max-h-[75vh] overflow-y-auto shadow-2xl">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-gray-900">{getTitle()}</h3>
            <button 
              onClick={() => {
                setShowAdminModal(false);
                setEditingItem(null);
              }} 
              className="p-2 active:bg-gray-100 rounded-xl"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              {adminView === 'branches' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-700">Nombre</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={e => setFormData({...formData, name: e.target.value})}
                      required
                      className="w-full bg-gray-50 rounded-xl p-3 outline-none text-gray-900 border border-gray-300"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-2 text-gray-700">Apertura</label>
                      <input
                        type="time"
                        value={formData.startTime}
                        onChange={e => setFormData({...formData, startTime: e.target.value})}
                        className="w-full bg-gray-50 rounded-xl p-3 outline-none text-gray-900 border border-gray-300"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2 text-gray-700">Cierre</label>
                      <input
                        type="time"
                        value={formData.endTime}
                        onChange={e => setFormData({...formData, endTime: e.target.value})}
                        className="w-full bg-gray-50 rounded-xl p-3 outline-none text-gray-900 border border-gray-300"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-2 text-gray-700">Almuerzo inicio</label>
                      <input
                        type="time"
                        value={formData.lunchStart}
                        onChange={e => setFormData({...formData, lunchStart: e.target.value})}
                        className="w-full bg-gray-50 rounded-xl p-3 outline-none text-gray-900 border border-gray-300"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2 text-gray-700">Almuerzo fin</label>
                      <input
                        type="time"
                        value={formData.lunchEnd}
                        onChange={e => setFormData({...formData, lunchEnd: e.target.value})}
                        className="w-full bg-gray-50 rounded-xl p-3 outline-none text-gray-900 border border-gray-300"
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-700">Sistema de comisiones</label>
                      <button
                        type="button"
                        onClick={() => setFormData({...formData, commissionsEnabled: !formData.commissionsEnabled})}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          formData.commissionsEnabled ? 'bg-blue-600' : 'bg-gray-200'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            formData.commissionsEnabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                    {formData.commissionsEnabled ? (
                      <div className="space-y-2">
                        {formData.chairs.map((chair, chairIdx) => (
                          <div key={chairIdx} className="flex gap-2 items-center">
                            <div className="flex-1 bg-gray-50 rounded-lg p-2 border">
                              <input
                                type="number"
                                min="1"
                                value={chair.number}
                                onChange={e => {
                                  const updated = [...formData.chairs];
                                  updated[chairIdx].number = parseInt(e.target.value) || 1;
                                  setFormData({...formData, chairs: updated});
                                }}
                                className="w-full bg-transparent text-xs outline-none"
                                placeholder="#"
                              />
                            </div>
                            <div className="flex-1 bg-gray-50 rounded-lg p-2 border">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={chair.commission}
                                onChange={e => {
                                  const updated = [...formData.chairs];
                                  updated[chairIdx].commission = parseInt(e.target.value) || 0;
                                  setFormData({...formData, chairs: updated});
                                }}
                                className="w-full bg-transparent text-xs outline-none"
                                placeholder="%"
                              />
                            </div>
                            {formData.chairs.length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = formData.chairs.filter((_, i) => i !== chairIdx);
                                  setFormData({...formData, chairs: updated});
                                }}
                                className="text-red-500 p-1"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            const nextNumber = Math.max(...formData.chairs.map(c => c.number)) + 1;
                            setFormData({...formData, chairs: [...formData.chairs, { number: nextNumber, commission: 15 }]});
                          }}
                          className="w-full bg-gray-100 text-gray-600 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1 border"
                        >
                          <Plus className="w-3 h-3" /> Agregar silla
                        </button>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-sm font-medium mb-2 text-gray-700">Número de sillas</label>
                        <input
                          type="number"
                          min="1"
                          value={formData.chairs.length}
                          onChange={e => {
                            const count = parseInt(e.target.value) || 1;
                            const newChairs = [];
                            for (let i = 1; i <= count; i++) {
                              newChairs.push({ number: i, commission: 15 });
                            }
                            setFormData({...formData, chairs: newChairs});
                          }}
                          className="w-full bg-gray-50 rounded-xl p-3 outline-none text-gray-900 border border-gray-300"
                        />
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-700">Días laborales</label>
                    <div className="grid grid-cols-7 gap-1">
                      {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map((day, idx) => {
                        const shortDay = ['L', 'M', 'X', 'J', 'V', 'S', 'D'][idx];
                        const isSelected = formData.workDays.includes(day);
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => {
                              const newWorkDays = isSelected 
                                ? formData.workDays.filter(d => d !== day)
                                : [...formData.workDays, day];
                              setFormData({...formData, workDays: newWorkDays});
                            }}
                            className={`h-10 rounded-lg text-sm font-medium transition-all ${
                              isSelected 
                                ? 'bg-black text-white' 
                                : 'bg-gray-100 text-gray-600 border border-gray-300'
                            }`}
                          >
                            {shortDay}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              {adminView === 'services' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-700">Nombre</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={e => setFormData({...formData, name: e.target.value})}
                      required
                      className="w-full bg-gray-50 rounded-xl p-3 outline-none text-gray-900 border border-gray-300"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-2 text-gray-700">Precio</label>
                      <input
                        type="number"
                        value={formData.price}
                        onChange={e => setFormData({...formData, price: e.target.value})}
                        required
                        className="w-full bg-gray-50 rounded-xl p-3 outline-none text-gray-900 border border-gray-300"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2 text-gray-700">Duración (min)</label>
                      <input
                        type="number"
                        value={formData.duration}
                        onChange={e => setFormData({...formData, duration: parseInt(e.target.value) || 30})}
                        required
                        className="w-full bg-gray-50 rounded-xl p-3 outline-none text-gray-900 border border-gray-300"
                      />
                    </div>
                  </div>
                </>
              )}

              {adminView === 'users' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-700">Nombre</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={e => setFormData({...formData, name: e.target.value})}
                      required
                      className="w-full bg-gray-50 rounded-xl p-3 outline-none text-gray-900 border border-gray-300"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-700">Email</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={e => setFormData({...formData, email: e.target.value})}
                      required
                      className="w-full bg-gray-50 rounded-xl p-3 outline-none text-gray-900 border border-gray-300"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-700">Rol</label>
                    <select
                      value={formData.role}
                      onChange={e => setFormData({...formData, role: e.target.value})}
                      className="w-full bg-gray-50 rounded-xl p-3 outline-none text-gray-900 border border-gray-300"
                    >
                      <option value="user">Usuario</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </div>
                </>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-red-600 text-sm font-medium">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-black text-white py-3.5 rounded-xl font-semibold text-base active:scale-[0.98] transition-all disabled:opacity-50 shadow-sm"
              >
                {loading ? 'Guardando...' : editingItem ? 'Actualizar' : 'Crear'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  const selectedBranchData = branches.find(b => b.id === selectedBranch);
  
  const todayAppointments = selectedBranch ? appointments.filter(a => {
    // Usar T12:00:00 para evitar problemas de zona horaria
    const appointmentDate = a.appointment_date.split('T')[0];
    const branchMatches = String(a.branch_id) === String(selectedBranch);
    const dateMatches = appointmentDate === selectedDate;
    
    console.log('Filtering appointment:', {
      appointmentId: a.id,
      clientName: a.client_name,
      appointmentBranch: a.branch_id,
      selectedBranch: selectedBranch,
      rawAppointmentDate: a.appointment_date,
      appointmentDate: appointmentDate,
      selectedDate: selectedDate,
      branchMatches,
      dateMatches,
      finalMatch: branchMatches && dateMatches
    });
    
    return branchMatches && dateMatches;
  }) : [];
  
  console.log('Final filtered appointments:', todayAppointments.length, todayAppointments);

  // Filter only scheduled appointments for "Próximas Sesiones" - show all scheduled appointments for selected date
  const upcomingAppointments = todayAppointments.filter(a => a.status === 'scheduled');

  // Close date picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showDatePicker && !event.target.closest('.date-picker-container')) {
        setShowDatePicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDatePicker]);

  // Check for overdue appointments
  useEffect(() => {
    const checkOverdueAppointments = () => {
      const now = new Date();
      
      upcomingAppointments.forEach(appt => {
        // Create appointment datetime - handle different date formats
        const appointmentDate = appt.appointment_date.split('T')[0]; // Get just the date part
        const appointmentTime = appt.appointment_time.substring(0, 5); // Get HH:MM only
        const appointmentDateTime = new Date(`${appointmentDate}T${appointmentTime}:00`);
        const overdueTime = new Date(appointmentDateTime.getTime() + 15 * 60 * 1000);
        
        console.log('Checking appointment:', {
          client: appt.client_name,
          rawDate: appt.appointment_date,
          rawTime: appt.appointment_time,
          cleanDate: appointmentDate,
          cleanTime: appointmentTime,
          parsedDateTime: appointmentDateTime.toLocaleString(),
          overdueTime: overdueTime.toLocaleString(),
          currentTime: now.toLocaleString(),
          isOverdue: now > overdueTime,
          hasOverdueModal: !!overdueAppointment
        });
        
        // If appointment time has passed by more than 15 minutes and no modal is currently shown
        if (now > overdueTime && !overdueAppointment && !showOverdueModal && !isNaN(appointmentDateTime.getTime())) {
          console.log('Setting overdue appointment:', appt.client_name);
          setOverdueAppointment(appt);
          setShowOverdueModal(true);
        }
      });
    };

    const interval = setInterval(checkOverdueAppointments, 60000); // Check every minute
    checkOverdueAppointments(); // Check immediately
    
    return () => clearInterval(interval);
  }, [upcomingAppointments, overdueAppointment, showOverdueModal]);

  // Calculate extended metrics
  const getExtendedMetrics = () => {
    console.log('Calculating metrics with appointments:', appointments.length);
    
    if (!selectedBranch || appointments.length === 0) {
      return {
        yesterday: { total: 0, completed: 0, noShows: 0, revenue: 0 },
        today: { total: 0, completed: 0, noShows: 0, revenue: 0 },
        week: { total: 0, completed: 0, noShows: 0, revenue: 0 },
        month: { total: 0, completed: 0, noShows: 0, revenue: 0 }
      };
    }
    
    // Usar la fecha seleccionada como referencia en lugar de la fecha actual (con zona horaria México)
    const referenceDate = new Date(selectedDate + 'T12:00:00'); // Usar mediodía para evitar problemas de zona horaria
    const todayStr = selectedDate;
    
    // Calcular fechas basadas en la fecha seleccionada
    const yesterday = new Date(referenceDate);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.getFullYear() + '-' + 
                        String(yesterday.getMonth() + 1).padStart(2, '0') + '-' + 
                        String(yesterday.getDate()).padStart(2, '0');
    
    const weekStart = new Date(referenceDate);
    weekStart.setDate(referenceDate.getDate() - referenceDate.getDay());
    weekStart.setHours(0, 0, 0, 0);
    
    const monthStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
    monthStart.setHours(0, 0, 0, 0);
    
    // Filter appointments for this branch
    const branchAppointments = appointments.filter(a => String(a.branch_id) === String(selectedBranch));
    console.log('Branch appointments:', branchAppointments.length);
    
    const calculateMetrics = (appointments) => {
      const completed = appointments.filter(a => a.status === 'completed');
      const noShows = appointments.filter(a => a.status === 'no-show');
      const revenue = completed.reduce((sum, a) => {
        const service = services.find(s => s.id === a.service_id);
        return sum + (service ? parseFloat(service.price) : 0);
      }, 0);
      
      return {
        total: appointments.length,
        completed: completed.length,
        noShows: noShows.length,
        revenue: revenue
      };
    };
    
    // Calcular métricas por período
    const yesterdayAppts = branchAppointments.filter(a => {
      const apptDate = a.appointment_date.split('T')[0];
      return apptDate === yesterdayStr;
    });
    
    const todayAppts = branchAppointments.filter(a => {
      const apptDate = a.appointment_date.split('T')[0];
      return apptDate === todayStr;
    });
    
    const weekAppts = branchAppointments.filter(a => {
      const apptDate = new Date(a.appointment_date.split('T')[0] + 'T12:00:00'); // Usar mediodía
      return apptDate >= weekStart && apptDate <= referenceDate;
    });
    
    const monthAppts = branchAppointments.filter(a => {
      const apptDate = new Date(a.appointment_date.split('T')[0] + 'T12:00:00'); // Usar mediodía
      return apptDate >= monthStart && apptDate <= referenceDate;
    });
    
    const result = {
      yesterday: calculateMetrics(yesterdayAppts),
      today: calculateMetrics(todayAppts),
      week: calculateMetrics(weekAppts),
      month: calculateMetrics(monthAppts)
    };
    
    console.log('Extended metrics result:', result);
    return result;
  };

  // Get current metrics from backend API
  const currentMetrics = metrics || { todayAppts: 0, completed: 0, noShows: 0, revenue: 0 };
  
  console.log('Using backend metrics:', currentMetrics);

  // Calculate commission metrics
  const getTopCommission = () => {
    if (!selectedBranch || !selectedBranchData?.chairs) return 0;
    
    const todayCompletedAppts = todayAppointments.filter(a => a.status === 'completed');
    let maxCommission = 0;
    
    selectedBranchData.chairs.forEach(chair => {
      const chairAppts = todayCompletedAppts.filter(a => a.chair_id === chair.id);
      const chairRevenue = chairAppts.reduce((sum, a) => {
        const service = services.find(s => s.id === a.service_id);
        return sum + (service ? parseFloat(service.price) : 0);
      }, 0);
      const commission = (chairRevenue * (chair.commission || 0)) / 100;
      if (commission > maxCommission) maxCommission = commission;
    });
    
    return maxCommission.toFixed(0);
  };

  // Calculate chair ranking
  const getTopChairRanking = () => {
    if (!selectedBranch || !selectedBranchData?.chairs) return { chairNumber: 1, revenue: 0 };
    
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    
    const monthAppts = appointments.filter(a => {
      const apptDate = new Date(a.appointment_date);
      return String(a.branch_id) === String(selectedBranch) && 
             apptDate >= monthStart && 
             a.status === 'completed';
    });
    
    let topChair = { chairNumber: 1, revenue: 0 };
    
    selectedBranchData.chairs.forEach(chair => {
      const chairAppts = monthAppts.filter(a => a.chair_id === chair.id);
      const chairRevenue = chairAppts.reduce((sum, a) => {
        const service = services.find(s => s.id === a.service_id);
        return sum + (service ? parseFloat(service.price) : 0);
      }, 0);
      
      if (chairRevenue > topChair.revenue) {
        topChair = { chairNumber: chair.chair_number, revenue: chairRevenue };
      }
    });
    
    return topChair;
  };

  // Commission Modal Component
  const CommissionModal = () => {

    /* ===============================
      1️⃣ ESTADOS PARA SWIPE
      =============================== */
    const [touchStartX, setTouchStartX] = useState(null);
    const [touchEndX, setTouchEndX] = useState(null);

    /* ===============================
      2️⃣ HANDLERS DE SWIPE
      =============================== */
    const handleTouchStart = (e) => {
      setTouchStartX(e.touches[0].clientX);
    };

    const handleTouchMove = (e) => {
      setTouchEndX(e.touches[0].clientX);
    };

    const handleTouchEnd = (chairCount) => {
      if (touchStartX === null || touchEndX === null) return;

      const delta = touchStartX - touchEndX;
      const threshold = 50;

      // Swipe izquierda → siguiente silla
      if (delta > threshold) {
        setCurrentChairIndex(prev =>
          Math.min(chairCount - 1, prev + 1)
        );
      }

      // Swipe derecha → silla anterior
      if (delta < -threshold) {
        setCurrentChairIndex(prev =>
          Math.max(0, prev - 1)
        );
      }

      setTouchStartX(null);
      setTouchEndX(null);
    };

    /* ===============================
      3️⃣ CALCULO DE COMISIONES
      =============================== */
    const getChairCommissions = () => {
      if (!selectedBranch || !selectedBranchData?.chairs) return [];

      return selectedBranchData.chairs.map(chair => {
        const periods = ['yesterday', 'today', 'week', 'month'].map(period => {
          let appts = [];
          const now = new Date();

          if (period === 'yesterday') {
            const y = new Date(now);
            y.setDate(y.getDate() - 1);
            const yStr = y.toISOString().split('T')[0];

            appts = appointments.filter(a =>
              String(a.branch_id) === String(selectedBranch) &&
              a.appointment_date.split('T')[0] === yStr &&
              a.status === 'completed' &&
              a.chair_id === chair.id
            );
          }

          if (period === 'today') {
            appts = todayAppointments.filter(a =>
              a.status === 'completed' &&
              a.chair_id === chair.id
            );
          }

          if (period === 'week') {
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - now.getDay());

            appts = appointments.filter(a => {
              const d = new Date(a.appointment_date);
              return (
                String(a.branch_id) === String(selectedBranch) &&
                d >= weekStart &&
                d <= now &&
                a.status === 'completed' &&
                a.chair_id === chair.id
              );
            });
          }

          if (period === 'month') {
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

            appts = appointments.filter(a => {
              const d = new Date(a.appointment_date);
              return (
                String(a.branch_id) === String(selectedBranch) &&
                d >= monthStart &&
                d <= now &&
                a.status === 'completed' &&
                a.chair_id === chair.id
              );
            });
          }

          const revenue = appts.reduce((sum, a) => {
            const service = services.find(s => s.id === a.service_id);
            return sum + (service ? Number(service.price) : 0);
          }, 0);

          return {
            period,
            revenue,
            commission: (revenue * (chair.commission || 0)) / 100
          };
        });

        return { chair, periods };
      });
    };

    const chairCommissions = getChairCommissions();

    /* ===============================
      4️⃣ RENDER
      =============================== */
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl max-h-[80vh] overflow-hidden">

          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold">Comisiones por Silla</h3>
            <button onClick={() => setShowCommissionModal(false)}>
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* ===============================
              5️⃣ ZONA SWIPEABLE
            =============================== */}
          <div
            className="overflow-y-auto max-h-96"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={() => handleTouchEnd(chairCommissions.length)}
          >
            {chairCommissions.map((chairData, index) => (
              <div
                key={chairData.chair.id}
                className={`transition-all duration-300 ${
                  index === currentChairIndex ? 'block' : 'hidden'
                }`}
              >
                <div className="text-center mb-6">
                  <h4 className="text-lg font-bold text-purple-600">
                    Silla {chairData.chair.chair_number}
                  </h4>
                  <p className="text-sm text-gray-500">
                    {chairData.chair.commission}% comisión
                  </p>
                </div>

                <div className="space-y-4">
                  {[
                    { label: 'Ayer', period: 'yesterday' },
                    { label: 'Hoy', period: 'today' },
                    { label: 'Semana', period: 'week' },
                    { label: 'Mes', period: 'month' }
                  ].map(({ label, period }) => {
                    const data = chairData.periods.find(p => p.period === period);
                    return (
                      <div key={period} className="flex justify-between border-b py-3">
                        <span>{label}</span>
                        <div className="text-right">
                          <div className="font-bold">${data.commission.toFixed(0)}</div>
                          <div className="text-xs text-gray-400">
                            ${data.revenue} ingresos
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          {chairCommissions.length > 1 && (
            <div className="mt-4 text-center text-xs text-gray-400">
              Desliza ← → para cambiar de silla
            </div>
          )}
        </div>
      </div>
    );
  };

  // Notification Modal Component
  const NotificationModal = () => {
    if (!notificationData) return null;
    
    const getNotificationIcon = () => {
      if (notificationData.action === 'reagendada') return '📅';
      if (notificationData.action === 'cancelada') return '❌';
      return '🎆'; // Nueva cita
    };
    
    const getNotificationTitle = () => {
      if (notificationData.action === 'reagendada') return '📅 Cita reagendada';
      if (notificationData.action === 'cancelada') return '❌ Cita cancelada';
      return '🆕 Nueva cita agendada';
    };
    
    const getNotificationMessage = () => {
      if (notificationData.action === 'reagendada') return 'Un cliente reagendó su cita desde el enlace público';
      if (notificationData.action === 'cancelada') return 'Un cliente canceló su cita desde el enlace público';
      return 'Un cliente acaba de agendar una cita desde el enlace público';
    };
    
    const getNotificationColor = () => {
      if (notificationData.action === 'reagendada') return 'from-blue-500 to-indigo-500';
      if (notificationData.action === 'cancelada') return 'from-red-500 to-pink-500';
      return 'from-green-500 to-emerald-500';
    };
    
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-6 w-full max-w-sm mx-auto shadow-2xl animate-in fade-in zoom-in duration-300">
          <div className="text-center mb-6">
            <div className={`w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-r ${getNotificationColor()} flex items-center justify-center shadow-lg`}>
              <span className="text-2xl">{getNotificationIcon()}</span>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              {getNotificationTitle()}
            </h3>
            <p className="text-gray-600 text-sm">
              {getNotificationMessage()}
            </p>
            
            {/* Connection status indicator */}
            <div className="flex items-center justify-center gap-2 mt-3 text-xs text-green-600">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              Notificación en tiempo real
            </div>
          </div>
          
          <div className="bg-gray-50 rounded-2xl p-4 mb-6 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600 text-sm font-medium">Cliente:</span>
              <span className="font-bold text-gray-900">{notificationData.clientName}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 text-sm font-medium">Teléfono:</span>
              <span className="font-semibold text-blue-600">{notificationData.clientPhone}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 text-sm font-medium">Servicio:</span>
              <span className="font-semibold text-gray-900">{notificationData.serviceName}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 text-sm font-medium">Silla:</span>
              <span className="font-bold text-purple-600">#{notificationData.chairNumber}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 text-sm font-medium">Fecha:</span>
              <span className="font-semibold text-gray-900">{format(new Date(notificationData.date + 'T00:00:00'), 'd MMM yyyy', { locale: es })}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 text-sm font-medium">Hora:</span>
              <span className="font-bold text-orange-600">{notificationData.time}</span>
            </div>
            {notificationData.branchName && (
              <div className="flex justify-between items-center">
                <span className="text-gray-600 text-sm font-medium">Sucursal:</span>
                <span className="font-semibold text-gray-900">{notificationData.branchName}</span>
              </div>
            )}
          </div>
          
          <button
            onClick={() => {
              setShowNotificationModal(false);
              setNotificationData(null);
              // Force refresh data immediately
              loadUserData();
              loadBranchData();
            }}
            className={`w-full bg-gradient-to-r ${getNotificationColor()} text-white py-3 rounded-xl font-semibold text-sm active:scale-[0.98] transition-all shadow-sm`}
          >
            ✨ Actualizar vista
          </button>
        </div>
      </div>
    );
  };
  // QR Modal Component
  const QRModal = () => {
    const generatePublicLink = (chairId) => {
      return `${window.location.origin}/book/${selectedBranch}/${chairId}`;
    };

    const generateQRCode = (text) => {
      // Simple QR code generation using a service
      return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(text)}`;
    };

    if (!selectedChairForQR) return null;

    const publicLink = generatePublicLink(selectedChairForQR.id);
    const qrCodeUrl = generateQRCode(publicLink);

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-6 w-full max-w-sm mx-auto shadow-2xl">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold">QR Silla {selectedChairForQR.chair_number}</h3>
            <button onClick={() => setShowQRModal(false)} className="p-2 rounded-xl active:bg-gray-100">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
          
          <div className="text-center">
            <div className="bg-gray-50 rounded-2xl p-4 mb-4">
              <img src={qrCodeUrl} alt="QR Code" className="w-48 h-48 mx-auto" />
            </div>
            
            <p className="text-sm text-gray-600 mb-4">
              Los clientes pueden escanear este código para ver horarios disponibles y agendar citas
            </p>
            
            <div className="bg-gray-50 rounded-xl p-3 mb-4">
              <p className="text-xs text-gray-500 break-all">{publicLink}</p>
            </div>
            
            <button
              onClick={() => navigator.clipboard.writeText(publicLink)}
              className="w-full bg-blue-500 text-white py-3 rounded-xl font-semibold text-sm active:scale-[0.98] transition-all"
            >
              Copiar enlace
            </button>
          </div>
        </div>
      </div>
    );
  };
  const RankingModal = () => {
    const getChairRanking = () => {
      if (!selectedBranch || !selectedBranchData?.chairs) return [];
      
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      
      const monthAppts = appointments.filter(a => {
        const apptDate = new Date(a.appointment_date);
        return String(a.branch_id) === String(selectedBranch) && 
               apptDate >= monthStart && 
               a.status === 'completed';
      });
      
      return selectedBranchData.chairs.map(chair => {
        const chairAppts = monthAppts.filter(a => a.chair_id === chair.id);
        const revenue = chairAppts.reduce((sum, a) => {
          const service = services.find(s => s.id === a.service_id);
          return sum + (service ? parseFloat(service.price) : 0);
        }, 0);
        
        return {
          chair,
          revenue,
          appointments: chairAppts.length
        };
      }).sort((a, b) => b.revenue - a.revenue);
    };
    
    const ranking = getChairRanking();
    
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-6 w-full max-w-sm mx-auto shadow-2xl">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold">Ranking Mensual</h3>
            <button onClick={() => setShowRankingModal(false)} className="p-2 rounded-xl active:bg-gray-100">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
          
          <div className="space-y-3">
            {ranking.map((chairData, index) => (
              <div key={chairData.chair.id} className={`p-4 rounded-2xl border-2 ${
                index === 0 ? 'bg-gradient-to-r from-yellow-50 to-orange-50 border-yellow-200' :
                index === 1 ? 'bg-gradient-to-r from-gray-50 to-slate-50 border-gray-200' :
                index === 2 ? 'bg-gradient-to-r from-orange-50 to-red-50 border-orange-200' :
                'bg-gray-50 border-gray-200'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                      index === 0 ? 'bg-yellow-500 text-white' :
                      index === 1 ? 'bg-gray-400 text-white' :
                      index === 2 ? 'bg-orange-500 text-white' :
                      'bg-gray-300 text-gray-600'
                    }`}>
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-bold text-gray-900">Silla {chairData.chair.chair_number}</p>
                      <p className="text-xs text-gray-500">{chairData.appointments} citas</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-lg">${chairData.revenue}</p>
                    <p className="text-xs text-gray-500">{chairData.chair.commission}% comisión</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // Componente de calendario personalizado
  const CustomCalendar = ({ selectedDate, onSelectDate }) => {
    const [currentMonth, setCurrentMonth] = useState(new Date(selectedDate));
    
    const daysOfWeek = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    
    const getDaysInMonth = (date) => {
      const year = date.getFullYear();
      const month = date.getMonth();
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const daysInMonth = lastDay.getDate();
      const startingDayOfWeek = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
      
      const days = [];
      
      for (let i = 0; i < startingDayOfWeek; i++) {
        const prevMonthDay = new Date(year, month, -startingDayOfWeek + i + 1);
        days.push({ date: prevMonthDay, isCurrentMonth: false });
      }
      
      for (let i = 1; i <= daysInMonth; i++) {
        days.push({ date: new Date(year, month, i), isCurrentMonth: true });
      }
      
      const remainingDays = 42 - days.length;
      for (let i = 1; i <= remainingDays; i++) {
        days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
      }
      
      return days;
    };
    
    const days = getDaysInMonth(currentMonth);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const goToPreviousMonth = () => {
      setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
    };
    
    const goToNextMonth = () => {
      setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
    };
    
    const isToday = (date) => {
      return date.toDateString() === today.toDateString();
    };
    
    const isSelected = (date) => {
      const selected = new Date(selectedDate + 'T00:00:00');
      return date.toDateString() === selected.toDateString();
    };
    
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={goToPreviousMonth}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 active:scale-95 transition-all"
          >
            <ChevronRight className="w-5 h-5 rotate-180" />
          </button>
          
          <h3 className="text-base font-semibold text-gray-900">
            {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
          </h3>
          
          <button
            onClick={goToNextMonth}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 active:scale-95 transition-all"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        
        <div className="grid grid-cols-7 gap-1 mb-2">
          {daysOfWeek.map(day => (
            <div key={day} className="h-10 flex items-center justify-center text-xs font-semibold text-gray-400 uppercase">
              {day}
            </div>
          ))}
        </div>
        
        <div className="grid grid-cols-7 gap-1">
          {days.map((day, index) => {
            const dateStr = format(day.date, 'yyyy-MM-dd');
            return (
              <button
                key={index}
                onClick={() => day.isCurrentMonth && onSelectDate(dateStr)}
                disabled={!day.isCurrentMonth}
                className={`
                  h-10 w-10 rounded-full flex items-center justify-center text-sm font-normal transition-all mx-auto
                  ${!day.isCurrentMonth ? 'text-gray-300 cursor-default' : ''}
                  ${day.isCurrentMonth && !isSelected(day.date) && !isToday(day.date) ? 'text-gray-900 hover:bg-gray-100 active:scale-90' : ''}
                  ${isSelected(day.date) ? 'bg-blue-500 text-white font-semibold shadow-sm' : ''}
                  ${isToday(day.date) && !isSelected(day.date) ? 'bg-gray-100 font-semibold ring-2 ring-inset ring-blue-500' : ''}
                `}
              >
                {day.date.getDate()}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // Componente del modal de nueva cita
  const NewAppointmentModal = () => {
    const [formData, setFormData] = useState({
      clientName: '',
      clientPhone: '',
      serviceId: '',
      chairId: '',
      date: selectedDate,
      time: ''
    });
    const [availableTimeSlots, setAvailableTimeSlots] = useState([]);
    const [loadingTimes, setLoadingTimes] = useState(false);

    // Cargar horarios disponibles cuando cambien los parámetros
    useEffect(() => {
      const loadAvailableTimes = async () => {
        if (formData.date && formData.chairId && formData.serviceId) {
          setLoadingTimes(true);
          try {
            const times = await generateAvailableTimeSlots(
              formData.date, 
              formData.chairId, 
              formData.serviceId
            );
            setAvailableTimeSlots(times);
          } catch (error) {
            console.error('Error cargando horarios:', error);
            setAvailableTimeSlots([]);
          }
          setLoadingTimes(false);
        } else {
          setAvailableTimeSlots([]);
        }
      };

      loadAvailableTimes();
    }, [formData.date, formData.chairId, formData.serviceId]);

    const handleSubmit = (e) => {
      e.preventDefault();
      createAppointment({
        ...formData,
        branchId: selectedBranch
      });
    };

    const handleInputChange = (field, value) => {
      setFormData(prev => ({
        ...prev,
        [field]: value,
        // Reset time when chair or service changes
        ...(field === 'chairId' || field === 'serviceId' ? { time: '' } : {})
      }));
    };

    return (
      <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-2">
        <div className="bg-white rounded-2xl p-4 w-full max-w-sm max-h-[75vh] overflow-y-auto shadow-2xl">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-gray-900">Nueva cita</h3>
            <button 
              onClick={() => setShowModal(false)} 
              className="p-2 active:bg-gray-100 rounded-xl"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700">Cliente</label>
                <input
                  type="text"
                  value={formData.clientName}
                  onChange={e => handleInputChange('clientName', e.target.value)}
                  required
                  className="w-full bg-gray-50 rounded-xl p-3 outline-none text-gray-900 border border-gray-300"
                  placeholder="Nombre del cliente"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700">Teléfono</label>
                <input
                  type="tel"
                  value={formData.clientPhone}
                  onChange={e => handleInputChange('clientPhone', e.target.value)}
                  required
                  className="w-full bg-gray-50 rounded-xl p-3 outline-none text-gray-900 border border-gray-300"
                  placeholder="Número de teléfono"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700">Servicio</label>
                <select
                  value={formData.serviceId}
                  onChange={e => handleInputChange('serviceId', e.target.value)}
                  required
                  className="w-full bg-gray-50 rounded-xl p-3 outline-none text-gray-900 border border-gray-300 appearance-none"
                >
                  <option value="">Seleccionar servicio...</option>
                  {services.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} - ${s.price} ({s.duration} min)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700">Silla</label>
                <select
                  value={formData.chairId}
                  onChange={e => handleInputChange('chairId', e.target.value)}
                  required
                  className="w-full bg-gray-50 rounded-xl p-3 outline-none text-gray-900 border border-gray-300 appearance-none"
                >
                  <option value="">Seleccionar silla...</option>
                  {selectedBranchData?.chairs?.map(c => (
                    <option key={c.id} value={c.id}>Silla {c.chair_number}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700">Fecha</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={e => handleInputChange('date', e.target.value)}
                  required
                  className="w-full bg-gray-50 rounded-xl p-3 outline-none text-gray-900 border border-gray-300"
                />
              </div>

              {formData.serviceId && formData.chairId && formData.date && (
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700">Horarios disponibles</label>
                  {loadingTimes ? (
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-black mx-auto mb-2"></div>
                      <p className="text-gray-500 text-sm">Cargando horarios...</p>
                    </div>
                  ) : availableTimeSlots.length === 0 ? (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-center">
                      <p className="text-yellow-600 text-sm font-medium">
                        No hay horarios disponibles para esta fecha
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                      {availableTimeSlots.map(slot => (
                        <button
                          key={slot.time}
                          type="button"
                          onClick={() => handleInputChange('time', slot.time)}
                          className={`p-3 rounded-xl text-sm font-medium transition-all ${
                            formData.time === slot.time
                              ? 'bg-black text-white shadow-sm'
                              : 'bg-gray-50 text-gray-700 border border-gray-300 hover:bg-gray-100'
                          }`}
                        >
                          {slot.display}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-red-600 text-sm font-medium">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !formData.time}
                className="w-full bg-black text-white py-3 rounded-xl font-semibold text-sm active:scale-[0.98] transition-all disabled:opacity-50 shadow-sm"
              >
                {loading ? 'Creando...' : 'Crear cita'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  // RENDER: Loading
  if (view === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
      </div>
    );
  }

  // RENDER: Login/Register
  if (view === 'login' || view === 'register') {
    return (
      <div className="min-h-screen bg-gray-50 text-black flex items-center justify-center p-4">
        {/* Welcome Modal */}
        {showWelcomeModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm mx-auto overflow-hidden">
              <div className="p-8 text-center">
                <img src={logo} alt="Logo" className="h-16 w-auto mx-auto mb-6" />
                <h2 className="text-xl font-bold text-black mb-3">Sucursales, sillas y citas claras. Todo desde un solo lugar</h2>
                <img src={banner} alt="Banner" className="w-full rounded-2xl mb-6" />
                <button
                  onClick={() => setShowVideoModal(true)}
                  className="w-full bg-gray-100 text-black py-3 rounded-xl font-semibold text-sm mb-4 active:bg-gray-200 flex items-center justify-center gap-2"
                >
                  <Play className="w-4 h-4" />
                  VER COMO FUNCIONA
                </button>
                <button
                  onClick={() => setShowWelcomeModal(false)}
                  className="w-full bg-black text-white py-3 rounded-xl font-semibold text-sm active:scale-[0.98] transition-all"
                >
                  ACCEDE GRATIS
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Video Modal */}
        {showVideoModal && (
          <div className="fixed inset-0 bg-black z-[10000] flex items-center justify-center">
            <button
              onClick={() => setShowVideoModal(false)}
              className="absolute top-4 right-4 text-white p-2 z-10"
            >
              <X className="w-6 h-6" />
            </button>
            <video
              src={video}
              controls
              autoPlay
              className="w-full h-full object-contain"
            />
          </div>
        )}
        
        <div className="w-full max-w-sm">
          <div className="bg-white rounded-3xl shadow-2xl p-8">
            <div className="text-center mb-8">
              <div className="flex justify-center mb-4">
                <img src={logo} alt="Logo" className="h-16 w-auto" />
              </div>
              <p className="text-gray-500">Sistema de gestión profesional</p>
            </div>

            <div className="flex rounded-2xl bg-gray-100 p-1 mb-6 border border-gray-200">
              <button
                onClick={() => { setView('login'); setError(''); }}
                className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all duration-200 ${
                  view === 'login' 
                    ? 'bg-white text-black shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Ingresar
              </button>
              <button
                onClick={() => { setView('register'); setError(''); }}
                className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all duration-200 ${
                  view === 'register' 
                    ? 'bg-white text-black shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Registrar
              </button>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
                <p className="text-red-600 text-sm font-medium">{error}</p>
              </div>
            )}

            {view === 'register' && (
              <div className="mb-4">
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                  <div className="flex items-center">
                    <User className="w-5 h-5 text-gray-400 mr-3" />
                    <input
                      type="text"
                      value={registerForm.name}
                      onChange={e => setRegisterForm({ ...registerForm, name: e.target.value })}
                      className="bg-transparent flex-1 outline-none text-gray-900 placeholder-gray-400"
                      placeholder="Tu nombre"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="mb-4">
              <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                <div className="flex items-center">
                  <Mail className="w-5 h-5 text-gray-400 mr-3" />
                  <input
                    type="email"
                    value={view === 'login' ? loginForm.email : registerForm.email}
                    onChange={e => view === 'login' 
                      ? setLoginForm({ ...loginForm, email: e.target.value })
                      : setRegisterForm({ ...registerForm, email: e.target.value })}
                    className="bg-transparent flex-1 outline-none text-gray-900 placeholder-gray-400"
                    placeholder="tu@email.com"
                  />
                </div>
              </div>
            </div>

            <div className="mb-6">
              <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                <div className="flex items-center">
                  <Lock className="w-5 h-5 text-gray-400 mr-3" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={view === 'login' ? loginForm.password : registerForm.password}
                    onChange={e => view === 'login'
                      ? setLoginForm({ ...loginForm, password: e.target.value })
                      : setRegisterForm({ ...registerForm, password: e.target.value })}
                    className="bg-transparent flex-1 outline-none text-gray-900 placeholder-gray-400"
                    placeholder="••••••••"
                  />
                  <button 
                    onClick={() => setShowPassword(!showPassword)} 
                    className="text-gray-400 active:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </div>

            <button
              onClick={view === 'login' ? handleLogin : handleRegister}
              disabled={loading}
              className="w-full bg-black text-white py-3.5 rounded-xl font-semibold text-base active:scale-[0.98] transition-all duration-200 disabled:opacity-50 shadow-md"
            >
              {loading ? 'Procesando...' : view === 'login' ? 'Ingresar' : 'Crear cuenta'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // RENDER: Onboarding
  if (view === 'onboarding') {
    return (
      <div className="min-h-screen bg-gray-50 text-black p-4">
        <div className="max-w-md mx-auto">
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-1">Configura tu barbería</h2>
            <p className="text-gray-500 text-sm">Paso {onboardingStep + 1} de 4</p>
            <div className="mt-4 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-black rounded-full transition-all duration-300" 
                style={{ width: `${((onboardingStep + 1) / 4) * 100}%` }} 
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
              <p className="text-red-600 text-sm font-medium">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            {onboardingStep === 0 && (
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <h3 className="text-lg font-semibold mb-4">Información básica</h3>
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                  <input
                    type="text"
                    value={onboardingData.shopName}
                    onChange={e => setOnboardingData({ ...onboardingData, shopName: e.target.value })}
                    className="w-full bg-transparent outline-none text-gray-900 placeholder-gray-400"
                    placeholder="Nombre de tu barbería"
                  />
                </div>
              </div>
            )}

            {onboardingStep === 1 && (
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold">Sucursales</h3>
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                    {onboardingData.branches.length}
                  </span>
                </div>
                
                <div className="space-y-3">
                  {onboardingData.branches.map((branch, idx) => (
                    <div key={idx} className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                      <div className="flex justify-between items-center mb-3">
                        <h4 className="font-medium text-sm">Sucursal {idx + 1}</h4>
                        {onboardingData.branches.length > 1 && (
                          <button 
                            onClick={() => {
                              const updated = onboardingData.branches.filter((_, i) => i !== idx);
                              setOnboardingData({ ...onboardingData, branches: updated });
                            }}
                            className="text-red-500 active:opacity-70"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      
                      <div className="space-y-3">
                        <div className="bg-white rounded-lg p-3 border">
                          <input
                            type="text"
                            value={branch.name}
                            onChange={e => {
                              const updated = [...onboardingData.branches];
                              updated[idx].name = e.target.value;
                              setOnboardingData({ ...onboardingData, branches: updated });
                            }}
                            className="w-full bg-transparent outline-none text-sm placeholder-gray-400"
                            placeholder="Nombre de sucursal"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { label: 'Apertura', value: branch.startTime, key: 'startTime' },
                            { label: 'Cierre', value: branch.endTime, key: 'endTime' },
                            { label: 'Comida inicio', value: branch.lunchStart, key: 'lunchStart' },
                            { label: 'Comida fin', value: branch.lunchEnd, key: 'lunchEnd' }
                          ].map((time, timeIdx) => (
                            <div key={timeIdx} className="bg-white rounded-lg p-2 border">
                              <label className="block text-xs text-gray-500 mb-1">{time.label}</label>
                              <input
                                type="time"
                                value={time.value}
                                onChange={e => {
                                  const updated = [...onboardingData.branches];
                                  updated[idx][time.key] = e.target.value;
                                  setOnboardingData({ ...onboardingData, branches: updated });
                                }}
                                className="w-full bg-transparent text-sm outline-none"
                              />
                            </div>
                          ))}
                        </div>

                        <div className="bg-white rounded-lg p-3 border">
                          <div className="flex items-center justify-between mb-2">
                            <label className="block text-xs text-gray-500">Sistema de comisiones</label>
                            <button
                              type="button"
                              onClick={() => {
                                const updated = [...onboardingData.branches];
                                setOnboardingData({ ...onboardingData, commissionsEnabled: !onboardingData.commissionsEnabled });
                              }}
                              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                onboardingData.commissionsEnabled ? 'bg-blue-600' : 'bg-gray-200'
                              }`}
                            >
                              <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                  onboardingData.commissionsEnabled ? 'translate-x-6' : 'translate-x-1'
                                }`}
                              />
                            </button>
                          </div>
                          {onboardingData.commissionsEnabled && (
                            <div className="space-y-2">
                              {branch.chairs.map((chair, chairIdx) => (
                                <div key={chairIdx} className="flex gap-2 items-center">
                                  <div className="flex-1 bg-gray-50 rounded-lg p-2">
                                    <input
                                      type="number"
                                      min="1"
                                      value={chair.number}
                                      onChange={e => {
                                        const updated = [...onboardingData.branches];
                                        updated[idx].chairs[chairIdx].number = parseInt(e.target.value) || 1;
                                        setOnboardingData({ ...onboardingData, branches: updated });
                                      }}
                                      className="w-full bg-transparent text-xs outline-none"
                                      placeholder="#"
                                    />
                                  </div>
                                  <div className="flex-1 bg-gray-50 rounded-lg p-2">
                                    <input
                                      type="number"
                                      min="0"
                                      max="100"
                                      value={chair.commission}
                                      onChange={e => {
                                        const updated = [...onboardingData.branches];
                                        updated[idx].chairs[chairIdx].commission = parseInt(e.target.value) || 0;
                                        setOnboardingData({ ...onboardingData, branches: updated });
                                      }}
                                      className="w-full bg-transparent text-xs outline-none"
                                      placeholder="%"
                                    />
                                  </div>
                                  {branch.chairs.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updated = [...onboardingData.branches];
                                        updated[idx].chairs = updated[idx].chairs.filter((_, i) => i !== chairIdx);
                                        setOnboardingData({ ...onboardingData, branches: updated });
                                      }}
                                      className="text-red-500 p-1"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = [...onboardingData.branches];
                                  const nextNumber = Math.max(...updated[idx].chairs.map(c => c.number)) + 1;
                                  updated[idx].chairs.push({ number: nextNumber, commission: 15 });
                                  setOnboardingData({ ...onboardingData, branches: updated });
                                }}
                                className="w-full bg-gray-100 text-gray-600 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1"
                              >
                                <Plus className="w-3 h-3" /> Agregar silla
                              </button>
                            </div>
                          )}
                          {!onboardingData.commissionsEnabled && (
                            <div className="space-y-2">
                              <div className="bg-gray-50 rounded-lg p-2">
                                <input
                                  type="number"
                                  min="1"
                                  value={branch.chairs.length}
                                  onChange={e => {
                                    const count = parseInt(e.target.value) || 1;
                                    const updated = [...onboardingData.branches];
                                    const newChairs = [];
                                    for (let i = 1; i <= count; i++) {
                                      newChairs.push({ number: i, commission: 15 });
                                    }
                                    updated[idx].chairs = newChairs;
                                    setOnboardingData({ ...onboardingData, branches: updated });
                                  }}
                                  className="w-full bg-transparent text-xs outline-none"
                                  placeholder="Número de sillas"
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        <div>
                          <label className="block text-xs text-gray-500 mb-2">Días laborales</label>
                          <div className="flex gap-1.5">
                            {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((day, dayIdx) => {
                              const fullDay = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'][dayIdx];
                              const isSelected = branch.workDays.includes(fullDay);
                              return (
                                <button
                                  key={day}
                                  type="button"
                                  onClick={() => {
                                    const updated = [...onboardingData.branches];
                                    if (isSelected) {
                                      updated[idx].workDays = updated[idx].workDays.filter(d => d !== fullDay);
                                    } else {
                                      updated[idx].workDays.push(fullDay);
                                    }
                                    setOnboardingData({ ...onboardingData, branches: updated });
                                  }}
                                  className={`flex-1 h-9 rounded-lg text-sm font-medium transition-all ${
                                    isSelected 
                                      ? 'bg-black text-white border border-black' 
                                      : 'bg-white text-gray-600 border border-gray-300'
                                  }`}
                                >
                                  {day}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => {
                    setOnboardingData({
                      ...onboardingData,
                      branches: [...onboardingData.branches, { 
                        name: '', 
                        workDays: [], 
                        startTime: '09:00', 
                        endTime: '18:00', 
                        lunchStart: '14:00', 
                        lunchEnd: '15:00', 
                        chairs: [{ number: 1, commission: 15 }, { number: 2, commission: 15 }]
                      }]
                    });
                  }}
                  className="w-full mt-3 bg-gray-100 text-gray-700 py-3 rounded-xl font-medium text-sm active:bg-gray-200 flex items-center justify-center gap-2 border border-gray-300"
                >
                  <Plus className="w-4 h-4" /> Agregar sucursal
                </button>
              </div>
            )}

            {onboardingStep === 2 && (
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold">Servicios</h3>
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                    {onboardingData.services.length}
                  </span>
                </div>

                <div className="space-y-3">
                  {onboardingData.services.map((service, idx) => (
                    <div key={idx} className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                      <div className="flex justify-between items-center mb-3">
                        <h4 className="font-medium text-sm">Servicio {idx + 1}</h4>
                        {onboardingData.services.length > 1 && (
                          <button 
                            onClick={() => {
                              const updated = onboardingData.services.filter((_, i) => i !== idx);
                              setOnboardingData({ ...onboardingData, services: updated });
                            }}
                            className="text-red-500 active:opacity-70"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      <div className="space-y-2">
                        <div className="bg-white rounded-lg p-3 border">
                          <input
                            type="text"
                            value={service.name}
                            onChange={e => {
                              const updated = [...onboardingData.services];
                              updated[idx].name = e.target.value;
                              setOnboardingData({ ...onboardingData, services: updated });
                            }}
                            className="w-full bg-transparent text-sm outline-none placeholder-gray-400"
                            placeholder="Nombre del servicio"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-white rounded-lg p-3 border">
                            <input
                              type="number"
                              value={service.price}
                              onChange={e => {
                                const updated = [...onboardingData.services];
                                updated[idx].price = e.target.value;
                                setOnboardingData({ ...onboardingData, services: updated });
                              }}
                              className="w-full bg-transparent text-sm outline-none placeholder-gray-400"
                              placeholder="Precio"
                            />
                          </div>
                          <div className="bg-white rounded-lg p-3 border">
                            <input
                              type="number"
                              value={service.duration}
                              onChange={e => {
                                const updated = [...onboardingData.services];
                                updated[idx].duration = parseInt(e.target.value) || 30;
                                setOnboardingData({ ...onboardingData, services: updated });
                              }}
                              className="w-full bg-transparent text-sm outline-none placeholder-gray-400"
                              placeholder="Minutos"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => {
                    setOnboardingData({
                      ...onboardingData,
                      services: [...onboardingData.services, { name: '', price: '', duration: 30 }]
                    });
                  }}
                  className="w-full mt-3 bg-gray-100 text-gray-700 py-3 rounded-xl font-medium text-sm active:bg-gray-200 flex items-center justify-center gap-2 border border-gray-300"
                >
                  <Plus className="w-4 h-4" /> Agregar servicio
                </button>
              </div>
            )}

            {onboardingStep === 3 && (
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <h3 className="text-lg font-semibold mb-4">Resumen</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-600">Barbería</span>
                    <span className="font-semibold">{onboardingData.shopName}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-600">Sucursales</span>
                    <span className="font-semibold">{onboardingData.branches.length}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-gray-600">Servicios</span>
                    <span className="font-semibold">{onboardingData.services.length}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 mt-6 pt-4 border-t border-gray-200">
            {onboardingStep > 0 && (
              <button
                onClick={() => setOnboardingStep(onboardingStep - 1)}
                className="flex-1 bg-gray-100 text-gray-700 py-3.5 rounded-xl font-semibold text-sm active:bg-gray-200 border border-gray-300"
              >
                Atrás
              </button>
            )}
            <button
              onClick={() => {
                if (onboardingStep < 3) {
                  setOnboardingStep(onboardingStep + 1);
                } else {
                  completeOnboarding();
                }
              }}
              disabled={loading}
              className={`flex-1 bg-black text-white py-3.5 rounded-xl font-semibold text-sm active:scale-[0.98] transition-all ${
                loading ? 'opacity-50' : ''
              }`}
            >
              {loading ? 'Procesando...' : onboardingStep === 3 ? 'Finalizar' : 'Continuar'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // RENDER: Dashboard
  return (
    <div className="min-h-screen bg-gray-50 text-black pb-20">
      {/* Header */}
      <div className="bg-white px-4 py-4 border-b border-gray-200">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Logo" className="h-8 w-auto" />
            <p className="text-sm text-gray-500">{currentUser?.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSubscriptionModal(true)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                subscriptionStatus.plan === 'pro' 
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white' 
                  : 'bg-gray-200 text-gray-700'
              }`}
            >
              {subscriptionStatus.plan === 'pro' ? `PRO ${subscriptionStatus.daysLeft}d` : 'FREE'}
            </button>
            {/* Temporary test button */}
            {subscriptionStatus.plan === 'free' && (
              <button
                onClick={async () => {
                  try {
                    await API.call('/stripe/manual-upgrade', { method: 'POST' });
                    await checkSubscriptionStatus();
                    alert('Actualizado a PRO');
                  } catch (err) {
                    alert('Error: ' + err.message);
                  }
                }}
                className="px-2 py-1 bg-green-500 text-white text-xs rounded"
              >
                Test
              </button>
            )}
            <button 
              onClick={handleLogout} 
              className="p-2 active:bg-gray-100 rounded-xl"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>

        {branches.length > 0 && (
          <div className="relative">
            <select
              value={selectedBranch || ''}
              onChange={e => setSelectedBranch(e.target.value)}
              className="w-full bg-gray-100 rounded-xl p-3 outline-none text-gray-900 border border-gray-300 appearance-none pr-10"
            >
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="p-4">
        {view === 'dashboard' && (
          <div className="animate-in fade-in duration-500">
            {/* SALUDO INICIAL */}
            <div className="mb-6 px-1">
              <h2 className="text-[32px] font-black text-black tracking-tight leading-tight">Métricas</h2>
              <p className="text-gray-400 text-[16px] font-medium">Resumen de tu actividad para hoy.</p>
            </div>

            {/* TARJETA HERO: CITAS TOTALES (ESTILO ELITE) */}
            <button
              onClick={() => {
                setMetricsModalType('appointments');
                setShowMetricsModal(true);
              }}
              className="relative overflow-hidden bg-black rounded-[2.5rem] p-8 shadow-2xl shadow-black/20 mb-8 group transition-all active:scale-[0.98] w-full"
            >
              {/* Efectos de luz Glassmorphism */}
              <div className="absolute -top-24 -right-24 w-64 h-64 bg-blue-600/20 blur-[80px] rounded-full"></div>
              <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-emerald-600/10 blur-[80px] rounded-full"></div>
              
              <div className="relative z-10 text-center">
                <h2 className="text-white/60 text-[11px] font-black uppercase tracking-[0.2em] mb-2">Citas Programadas</h2>
                <div className="flex items-center justify-center gap-1">
                  <span className="text-6xl font-black text-white tracking-tighter">
                    {currentMetrics.todayAppts || 0}
                  </span>
                </div>
                <div className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-white/10 backdrop-blur-md rounded-full border border-white/10">
                  <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></span>
                  <span className="text-white text-[13px] font-bold">
                    {new Date(selectedDate + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' })}
                  </span>
                </div>
              </div>
            </button>

            {/* GRID DE MÉTRICAS (SUB-TARJETAS) */}
            <div className={`grid ${onboardingData.commissionsEnabled ? 'grid-cols-2' : 'grid-cols-3'} gap-3 mb-6`}>
              <button
                onClick={() => {
                  setMetricsModalType('completed');
                  setShowMetricsModal(true);
                }}
                className="bg-white p-4 rounded-[2rem] shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center active:scale-[0.98] transition-all"
              >
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Éxito</span>
                <p className="text-[20px] font-black text-emerald-500">{currentMetrics.completed || 0}</p>
              </button>
              <button
                onClick={() => {
                  setMetricsModalType('noShows');
                  setShowMetricsModal(true);
                }}
                className="bg-white p-4 rounded-[2rem] shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center active:scale-[0.98] transition-all"
              >
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Faltas</span>
                <p className="text-[20px] font-black text-red-500">{currentMetrics.noShows || 0}</p>
              </button>
              <button
                onClick={() => {
                  setMetricsModalType('revenue');
                  setShowMetricsModal(true);
                }}
                className="bg-white p-4 rounded-[2rem] shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center active:scale-[0.98] transition-all"
              >
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Ingresos</span>
                <p className="text-[20px] font-black text-black font-mono">${currentMetrics.revenue || 0}</p>
              </button>
              {onboardingData.commissionsEnabled && (
                <button
                  onClick={() => setShowCommissionModal(true)}
                  className="bg-white p-4 rounded-[2rem] shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center active:scale-[0.98] transition-all"
                >
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Top Comisión</span>
                  <p className="text-[20px] font-black text-purple-500">${getTopCommission()}</p>
                </button>
              )}
            </div>

            {/* RANKING MENSUAL */}
            {onboardingData.commissionsEnabled && (
              <button
                onClick={() => setShowRankingModal(true)}
                className="group relative w-full bg-gradient-to-b from-white to-[#fbfbfd] rounded-[22px] p-[1px] mb-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] active:scale-[0.96] transition-all duration-300"
              >
                {/* El borde interno sutil que da el toque "Premium" */}
                <div className="bg-white rounded-[21px] p-5">
                  <div className="flex flex-col items-center">
                    <div className="flex items-center gap-1.5 mb-1">
                      {/* Un destello sutil que indica innovación */}
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                      <span className="text-gray-400 text-[10px] font-bold uppercase tracking-[0.12em]">
                        Ranking Mensual
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className="bg-gray-50 w-10 h-10 rounded-full flex items-center justify-center border border-gray-100 shadow-inner">
                        <span className="text-lg">🏆</span>
                      </div>
                      <div className="text-left">
                        <p className="text-gray-900 text-[17px] font-semibold tracking-tight leading-tight">
                          Silla {getTopChairRanking().chairNumber}
                        </p>
                        <p className="text-blue-600 text-[14px] font-medium">
                          ${getTopChairRanking().revenue} <span className="text-gray-400 font-normal">generados</span>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </button>
            )}

            {/* LISTADO DE CITAS DE HOY */}
            <div className="flex justify-between items-end mb-4 px-1">
              <h3 className="text-[17px] font-black text-black tracking-tight">Próximas Sesiones</h3>
              <button
                onClick={() => setShowModal(true)}
                className="text-[14px] font-bold text-black active:opacity-40 transition-opacity"
              >
                + Nueva cita
              </button>
            </div>

            {upcomingAppointments.length === 0 ? (
              <div className="bg-white rounded-[2.5rem] p-12 text-center border border-gray-100 shadow-sm">
                <div className="text-4xl mb-3 opacity-20">📅</div>
                <p className="text-gray-400 font-bold">Todo despejado por ahora</p>
              </div>
            ) : (
              <div className="ios-list-group shadow-sm">
                {upcomingAppointments.map((appt, index) => {
                  const service = services.find(s => s.id === appt.service_id);
                  const chair = selectedBranchData?.chairs?.find(c => c.id === appt.chair_id);
                  const statusColors = {
                    'completed': 'text-emerald-500 bg-emerald-50',
                    'no-show': 'text-red-500 bg-red-50',
                    'scheduled': 'text-blue-600 bg-blue-50'
                  };
                  
                  return (
                    <div key={appt.id} className="bg-white relative">
                      <div className="p-5 flex flex-col gap-4 active:bg-gray-50 transition-colors">
                        
                        <div className="flex justify-between items-start">
                          <div className="flex gap-4">
                            {/* Hora estilizada */}
                            <div className="flex flex-col items-center justify-center bg-gray-50 rounded-2xl w-14 h-14 border border-gray-100">
                              <span className="text-[15px] font-black text-black leading-none">{appt.appointment_time.substring(0, 5)}</span>
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
                                {format(new Date(appt.appointment_date.split('T')[0] + 'T12:00:00'), 'dd-MMM', { locale: es }).toUpperCase()}
                              </span>
                            </div>
                            
                            <div>
                              <p className="font-black text-black text-[17px] tracking-tight">{appt.client_name}</p>
                              <p className="text-[13px] text-gray-400 font-medium">{service?.name}</p>
                              <p className="text-[11px] text-gray-400 font-medium">{appt.client_phone}</p>
                              <div className="flex items-center gap-1 mt-1 text-[11px] font-bold text-gray-400 uppercase tracking-tighter">
                                <Scissors className="w-3 h-3" />
                                Silla {chair?.chair_number}
                              </div>
                            </div>
                          </div>

                          <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${statusColors[appt.status] || 'bg-gray-50 text-gray-500 border-gray-100'}`}>
                            {appt.status === 'scheduled' ? 'Pendiente' : appt.status}
                          </span>
                        </div>

                        {/* Botones de acción rápida estilo iOS */}
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setConfirmAction({ appointmentId: appt.id, status: 'completed' });
                              setShowConfirmModal(true);
                            }}
                            className="flex-1 bg-green-500 text-white py-2 px-3 rounded-lg text-xs font-medium active:scale-95 transition-all"
                          >
                            Completar
                          </button>
                          <button
                            onClick={() => {
                              setConfirmAction({ appointmentId: appt.id, status: 'no-show' });
                              setShowConfirmModal(true);
                            }}
                            className="flex-1 bg-red-500 text-white py-2 px-3 rounded-lg text-xs font-medium active:scale-95 transition-all"
                          >
                            No asistió
                          </button>
                        </div>
                        {/* {appt.status === 'scheduled' && (
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => {
                                setRescheduleAppointmentData(appt);
                                setShowRescheduleModal(true);
                              }}
                              className="flex-1 bg-blue-500 text-white py-2 px-3 rounded-lg text-xs font-medium active:scale-95 transition-all"
                            >
                              Reagendar
                            </button>
                            <button
                              onClick={() => {
                                if (confirm('¿Estás seguro de cancelar esta cita?')) {
                                  cancelAppointment(appt.id);
                                }
                              }}
                              className="flex-1 bg-gray-400 text-white py-2 px-3 rounded-lg text-xs font-medium active:scale-95 transition-all"
                            >
                              Cancelar
                            </button>
                          </div>
                        )} */}
                      </div>
                      
                      {/* Divisor delgado entre items */}
                      {index !== upcomingAppointments.length - 1 && (
                        <div className="ml-24 h-[0.5px] bg-gray-100"></div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {view === 'appointments' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Agenda</h2>
              <button
                onClick={() => setShowModal(true)}
                className="bg-transparent text-black text-sm font-medium flex items-center gap-1 px-0 py-0 hover:opacity-70 active:opacity-50"
              >
                <Plus className="w-4 h-4" />
                Nueva cita
              </button>
            </div>

             <div className="relative mb-4 date-picker-container">
              <button
                onClick={() => setShowDatePicker(!showDatePicker)}
                className="w-full bg-white rounded-2xl p-4 outline-none text-gray-900 border border-gray-200 shadow-sm text-lg font-medium flex items-center justify-between active:scale-[0.98] transition-all"
              >
                <span>{format(new Date(selectedDate + 'T00:00:00'), 'EEEE, d MMMM yyyy', { locale: es })}</span>
                <Calendar className="w-5 h-5 text-gray-400" />
              </button>
              
               {showDatePicker && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-3xl shadow-2xl border border-gray-100 z-50 overflow-hidden p-5">
                  {/* Custom Calendar */}
                  <CustomCalendar 
                    selectedDate={selectedDate}
                    onSelectDate={(date) => {
                      setSelectedDate(date);
                      setShowDatePicker(false);
                    }}
                  />
                </div>
              )}
            </div>

            {selectedBranchData?.chairs?.map(chair => {
              const chairAppts = todayAppointments.filter(a => a.chair_id === chair.id);
              const isExpanded = expandedChairs[chair.id];
              
              return (
                <div key={chair.id} className="mb-4">
                  <div className="w-full bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => setExpandedChairs(prev => ({ ...prev, [chair.id]: !prev[chair.id] }))}
                        className="flex items-center gap-3 flex-1 active:bg-gray-50 rounded-lg p-2 -m-2"
                      >
                        <Scissors className="w-5 h-5 text-gray-600" />
                        <div className="text-left">
                          <p className="font-semibold text-gray-900">Silla {chair.chair_number}</p>
                          <p className="text-xs text-gray-500">{chairAppts.length} citas</p>
                        </div>
                        <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ml-auto ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>
                      <button
                        onClick={() => {
                          setSelectedChairForQR(chair);
                          setShowQRModal(true);
                        }}
                        className="p-2 bg-blue-50 text-blue-600 rounded-lg active:bg-blue-100 transition-all ml-2"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M3 11h8V3H3v8zm2-6h4v4H5V5zM3 21h8v-8H3v8zm2-6h4v4H5v-4zM13 3v8h8V3h-8zm6 6h-4V5h4v4zM19 13h2v2h-2zM13 13h2v2h-2zM15 15h2v2h-2zM13 17h2v2h-2zM15 19h2v2h-2zM17 17h2v2h-2zM19 19h2v2h-2zM17 13h2v2h-2zM19 15h2v2h-2z"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                  
                  {isExpanded && (
                    <div className="mt-2">
                      {chairAppts.length === 0 ? (
                        <div className="bg-gray-50 rounded-xl p-4 text-center text-gray-400 text-sm border border-gray-200">
                          Sin citas programadas
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {chairAppts.map(appt => {
                            const service = services.find(s => s.id === appt.service_id);
                            return (
                              <div key={appt.id} className="bg-white rounded-xl p-3 border border-gray-200">
                                <div className="flex justify-between items-start mb-3">
                                  <div>
                                    <p className="font-medium text-gray-900">{appt.client_name}</p>
                                    <p className="text-sm text-gray-500">{service?.name}</p>
                                    <p className="text-xs text-gray-400 mt-1">{appt.appointment_time}</p>
                                  </div>
                                  <span className={`px-2 py-1 rounded-lg text-xs border ${
                                    appt.status === 'completed' ? 'bg-green-50 text-green-600 border-green-200' :
                                    appt.status === 'no-show' ? 'bg-red-50 text-red-600 border-red-200' :
                                    'bg-blue-50 text-blue-600 border-blue-200'
                                  }`}>
                                    {appt.status === 'completed' ? 'OK' : appt.status === 'no-show' ? 'NS' : 'AG'}
                                  </span>
                                </div>
                                {appt.status === 'scheduled' && (
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => {
                                        setRescheduleAppointmentData(appt);
                                        setShowRescheduleModal(true);
                                      }}
                                      className="flex-1 bg-black text-white py-2 rounded-lg text-xs font-medium active:scale-[0.98] transition-all"
                                    >
                                      Reagendar
                                    </button>
                                    <button
                                      onClick={() => {
                                        setCancelAppointmentId(appt.id);
                                        setShowCancelModal(true);
                                      }}
                                      className="flex-1 bg-gray-100 text-gray-600 py-2 rounded-lg text-xs font-medium active:bg-gray-200 transition-all"
                                    >
                                      Cancelar
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {view === 'admin' && (
          <div>
            {adminView === 'main' ? (
              <>
                <h2 className="text-xl font-bold mb-4">Administración</h2>
                <div className="space-y-3">
                  <button 
                    onClick={() => setAdminView('branches')}
                    className="w-full bg-white rounded-2xl p-4 flex items-center justify-between active:bg-gray-50 border border-gray-100 shadow-sm"
                  >
                    <div className="flex items-center gap-3">
                      <Building className="w-5 h-5 text-gray-600" />
                      <div className="text-left">
                        <p className="font-medium text-gray-900">Sucursales</p>
                        <p className="text-xs text-gray-500">{branches.length} registradas</p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </button>

                  <button 
                    onClick={() => setAdminView('services')}
                    className="w-full bg-white rounded-2xl p-4 flex items-center justify-between active:bg-gray-50 border border-gray-100 shadow-sm"
                  >
                    <div className="flex items-center gap-3">
                      <Scissors className="w-5 h-5 text-gray-600" />
                      <div className="text-left">
                        <p className="font-medium text-gray-900">Servicios</p>
                        <p className="text-xs text-gray-500">{services.length} activos</p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </button>

                  <button 
                    onClick={() => setAdminView('users')}
                    className="w-full bg-white rounded-2xl p-4 flex items-center justify-between active:bg-gray-50 border border-gray-100 shadow-sm"
                  >
                    <div className="flex items-center gap-3">
                      <Users className="w-5 h-5 text-gray-600" />
                      <div className="text-left">
                        <p className="font-medium text-gray-900">Usuarios</p>
                        <p className="text-xs text-gray-500">{users.length} en el sistema</p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <button 
                    onClick={() => setAdminView('main')}
                    className="flex items-center gap-2 text-gray-600 active:text-gray-800"
                  >
                    <ChevronRight className="w-4 h-4 rotate-180" />
                    <span className="text-sm font-medium">Volver</span>
                  </button>
                  <button
                    onClick={() => {
                      setEditingItem(null);
                      setShowAdminModal(true);
                    }}
                    className="bg-transparent text-black text-sm font-medium flex items-center gap-1 px-0 py-0 hover:opacity-70 active:opacity-50"
                  >
                    <Plus className="w-4 h-4" />
                    {adminView === 'branches' ? 'Nueva Sucursal' : adminView === 'services' ? 'Nuevo Servicio' : 'Nuevo Usuario'}
                  </button>
                </div>

                <div className="space-y-3">
                  {adminView === 'branches' && branches.map(branch => (
                    <div key={branch.id} className="bg-white rounded-xl p-4 border border-gray-200">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="font-medium text-gray-900">{branch.name}</h3>
                          <p className="text-sm text-gray-500">{branch.work_days?.join(', ')}</p>
                          <p className="text-xs text-gray-400">{branch.start_time} - {branch.end_time}</p>
                          <p className="text-xs text-gray-400">{branch.chairs?.length || 0} sillas</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditingItem(branch);
                              setShowAdminModal(true);
                            }}
                            className="p-2 text-blue-600 active:bg-blue-50 rounded-lg"
                          >
                            <Settings className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm('¿Eliminar esta sucursal?')) {
                                deleteBranch(branch.id);
                              }
                            }}
                            className="p-2 text-red-600 active:bg-red-50 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {adminView === 'services' && services.map(service => (
                    <div key={service.id} className="bg-white rounded-xl p-4 border border-gray-200">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-medium text-gray-900">{service.name}</h3>
                          <p className="text-sm text-gray-500">${service.price}</p>
                          <p className="text-xs text-gray-400">{service.duration} minutos</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditingItem(service);
                              setShowAdminModal(true);
                            }}
                            className="p-2 text-blue-600 active:bg-blue-50 rounded-lg"
                          >
                            <Settings className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm('¿Eliminar este servicio?')) {
                                deleteService(service.id);
                              }
                            }}
                            className="p-2 text-red-600 active:bg-red-50 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {adminView === 'users' && users.map(user => (
                    <div key={user.id} className="bg-white rounded-xl p-4 border border-gray-200">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-medium text-gray-900">{user.name}</h3>
                          <p className="text-sm text-gray-500">{user.email}</p>
                          <p className="text-xs text-gray-400 capitalize">{user.role}</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditingItem(user);
                              setShowAdminModal(true);
                            }}
                            className="p-2 text-blue-600 active:bg-blue-50 rounded-lg"
                          >
                            <Settings className="w-4 h-4" />
                          </button>
                          {user.id !== currentUser?.id && (
                            <button
                              onClick={() => {
                                if (confirm('¿Eliminar este usuario?')) {
                                  deleteUser(user.id);
                                }
                              }}
                              className="p-2 text-red-600 active:bg-red-50 rounded-lg"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Modal for New Appointment */}
      {showModal && <NewAppointmentModal />}
      
      {/* Modal for Reschedule Appointment */}
      {showRescheduleModal && <RescheduleModal />}
      
      {/* Modal for Confirm Action */}
      {showConfirmModal && <ConfirmModal />}
      
      {/* Modal for Cancel Appointment */}
      {showCancelModal && <CancelModal />}
      
      {/* Modal for Overdue Appointment */}
      {showOverdueModal && <OverdueModal />}
      
      {/* Modal for Metrics */}
      {showMetricsModal && <MetricsModal />}
      
      {/* Modal for Admin */}
      {showAdminModal && <AdminModal />}
      
      {/* Modal for Commission */}
      {showCommissionModal && <CommissionModal />}
      
      {/* Modal for Ranking */}
      {showRankingModal && <RankingModal />}
      
      {/* Modal for QR */}
      {showQRModal && <QRModal />}
      
      {/* Modal for Notification */}
      {showNotificationModal && <NotificationModal />}
      
      {/* Modal for Subscription */}
      {showSubscriptionModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm mx-auto shadow-2xl">
            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center">
                <span className="text-2xl">💎</span>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                {subscriptionStatus.plan === 'pro' ? 'Plan PRO Activo' : 'Actualizar a PRO'}
              </h3>
              <p className="text-gray-600 text-sm">
                {subscriptionStatus.plan === 'pro' 
                  ? `Tu plan PRO expira en ${subscriptionStatus.daysLeft} días`
                  : 'Desbloquea todas las funciones premium'}
              </p>
            </div>
            
            {subscriptionStatus.plan === 'free' && (
              <>
                <div className="bg-gray-50 rounded-2xl p-4 mb-6">
                  <div className="text-center mb-4">
                    <span className="text-3xl font-black text-gray-900">$99</span>
                    <span className="text-gray-500 text-sm ml-1">MXN/mes</span>
                  </div>
                  <ul className="space-y-2 text-sm text-gray-600">
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                      Citas ilimitadas
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                      Sistema de comisiones
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                      Notificaciones push
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                      Soporte prioritario
                    </li>
                  </ul>
                </div>
                
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowSubscriptionModal(false)}
                    className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-semibold text-sm active:bg-gray-200 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={upgradeToPro}
                    disabled={loading}
                    className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white py-3 rounded-xl font-semibold text-sm active:scale-[0.98] transition-all disabled:opacity-50"
                  >
                    {loading ? 'Procesando...' : 'Pagar $99'}
                  </button>
                </div>
              </>
            )}
            
            {subscriptionStatus.plan === 'pro' && (
              <button
                onClick={() => setShowSubscriptionModal(false)}
                className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white py-3 rounded-xl font-semibold text-sm active:scale-[0.98] transition-all"
              >
                Cerrar
              </button>
            )}
          </div>
        </div>
      )}
      
      {/* Modal for Expiration Warning */}
      {showExpirationModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm mx-auto shadow-2xl">
            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-orange-100 flex items-center justify-center">
                <span className="text-2xl">⚠️</span>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                Tu plan PRO expira pronto
              </h3>
              <p className="text-gray-600 text-sm">
                Te quedan {subscriptionStatus.daysLeft} días. Renueva ahora para mantener todas las funciones premium.
              </p>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => setShowExpirationModal(false)}
                className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-semibold text-sm active:bg-gray-200 transition-all"
              >
                Recordar después
              </button>
              <button
                onClick={() => {
                  setShowExpirationModal(false);
                  setShowSubscriptionModal(true);
                }}
                className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white py-3 rounded-xl font-semibold text-sm active:scale-[0.98] transition-all"
              >
                Renovar $99
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Modal for Payment Success */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm mx-auto shadow-2xl">
            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
                <span className="text-2xl">🎉</span>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                ¡Pago exitoso!
              </h3>
              <p className="text-gray-600 text-sm">
                Tu cuenta ha sido actualizada a PRO. Ahora tienes acceso a todas las funciones premium por 31 días.
              </p>
            </div>
            
            <button
              onClick={() => {
                setShowSuccessModal(false);
                // Force multiple subscription status checks
                checkSubscriptionStatus();
                setTimeout(() => checkSubscriptionStatus(), 2000);
                setTimeout(() => checkSubscriptionStatus(), 4000);
              }}
              className="w-full bg-gradient-to-r from-green-500 to-emerald-500 text-white py-3 rounded-xl font-semibold text-sm active:scale-[0.98] transition-all"
            >
              ¡Genial!
            </button>
          </div>
        </div>
      )}
      
      {/* Bottom Navigation - iPhone Style */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 z-40 safe-area-inset-bottom">
        <div className="flex justify-around items-center">
          {[
            { id: 'dashboard', icon: TrendingUp, label: 'Métricas' },
            { id: 'appointments', icon: Calendar, label: 'Agenda' },
            { id: 'admin', icon: Settings, label: 'Admin' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                setView(tab.id);
                localStorage.setItem('barberos_view', tab.id);
              }}
              className={`flex flex-col items-center py-2 px-4 rounded-lg transition-all ${
                view === tab.id 
                  ? 'text-blue-600' 
                  : 'text-gray-400 active:text-gray-600'
              }`}
            >
              <tab.icon className={`w-6 h-6 mb-1 ${
                view === tab.id ? 'text-blue-600' : 'text-gray-400'
              }`} />
              <span className="text-xs font-medium">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default BarberShopSaaS;