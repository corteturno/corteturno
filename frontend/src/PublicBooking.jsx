import React, { useState, useEffect } from 'react';
import { Calendar, Clock, User, Phone, Check, X, ArrowLeft } from 'lucide-react';
import { format } from "date-fns";
import { es } from "date-fns/locale";

const API_URL = '/api';

class PublicAPI {
  static async call(endpoint, options = {}) {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Error en la petición');
    }

    return response.json();
  }
}

const PublicBooking = ({ branchId, chairId }) => {
  const [step, setStep] = useState('welcome'); // welcome, schedule, book, success, manage, findAppointment
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedTime, setSelectedTime] = useState('');
  const [availableSlots, setAvailableSlots] = useState([]);
  const [services, setServices] = useState([]);
  const [branchData, setBranchData] = useState(null);
  const [chairData, setChairData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [bookingData, setBookingData] = useState({
    clientName: '',
    clientPhone: '',
    serviceId: ''
  });
  const [clientPhone, setClientPhone] = useState('');
  const [clientAppointments, setClientAppointments] = useState([]);

  useEffect(() => {
    loadInitialData();
    registerServiceWorker();
  }, [branchId, chairId]);

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

  // Show appointment confirmation notification
  const showAppointmentConfirmation = (appointmentData) => {
    if (Notification.permission === 'granted' && 'serviceWorker' in navigator) {
      const service = services.find(s => s.id === appointmentData.serviceId);
      const appointmentDate = format(new Date(appointmentData.date + 'T00:00:00'), 'd MMMM yyyy', { locale: es });
      
      navigator.serviceWorker.ready.then(registration => {
        registration.showNotification('✅ Cita Confirmada', {
          body: `Tu turno para ${service?.name} es el ${appointmentDate} a las ${appointmentData.time}. Recordatorio automático antes de tu turno.`,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          vibrate: [200, 100, 200],
          requireInteraction: true,
          tag: 'appointment-confirmation'
        });
        
        // Schedule reminder notification
        navigator.serviceWorker.controller?.postMessage({
          type: 'SCHEDULE_REMINDER',
          appointmentData: {
            serviceName: service?.name,
            date: appointmentData.date,
            time: appointmentData.time
          }
        });
      });
    }
  };

  useEffect(() => {
    if (selectedDate && bookingData.serviceId) {
      loadAvailableSlots();
    }
  }, [selectedDate, bookingData.serviceId]);

  const loadInitialData = async () => {
    try {
      const [branchResponse, servicesResponse] = await Promise.all([
        PublicAPI.call(`/public/branch/${branchId}`),
        PublicAPI.call(`/public/services/${branchId}`)
      ]);
      
      setBranchData(branchResponse);
      setServices(servicesResponse);
      
      const chair = branchResponse.chairs?.find(c => c.id === chairId);
      setChairData(chair);
    } catch (err) {
      setError('Error al cargar información: ' + err.message);
    }
  };

  const loadAvailableSlots = async () => {
    if (!bookingData.serviceId) return;
    
    setLoading(true);
    try {
      const slots = await PublicAPI.call(
        `/public/available-times?date=${selectedDate}&branchId=${branchId}&chairId=${chairId}&serviceId=${bookingData.serviceId}`
      );
      setAvailableSlots(slots);
    } catch (err) {
      setError('Error al cargar horarios: ' + err.message);
      setAvailableSlots([]);
    }
    setLoading(false);
  };

  const findClientAppointments = async () => {
    if (!clientPhone) {
      setError('Ingresa tu número de teléfono');
      return;
    }
    
    setLoading(true);
    try {
      const appointments = await PublicAPI.call(
        `/public/appointments?phone=${clientPhone}&branchId=${branchId}&chairId=${chairId}`
      );
      setClientAppointments(appointments);
      setStep('manage');
    } catch (err) {
      setError('No se encontraron citas con este teléfono');
    }
    setLoading(false);
  };

  const rescheduleClientAppointment = async (appointmentId, newDate, newTime) => {
    setLoading(true);
    try {
      await PublicAPI.call(`/public/reschedule/${appointmentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ date: newDate, time: newTime })
      });
      await findClientAppointments(); // Refresh appointments
    } catch (err) {
      setError('Error al reagendar: ' + err.message);
    }
    setLoading(false);
  };

  const cancelClientAppointment = async (appointmentId) => {
    setLoading(true);
    try {
      await PublicAPI.call(`/public/cancel/${appointmentId}`, {
        method: 'DELETE'
      });
      await findClientAppointments(); // Refresh appointments
    } catch (err) {
      setError('Error al cancelar: ' + err.message);
    }
    setLoading(false);
  };
  const handleBooking = async () => {
    if (!bookingData.clientName || !bookingData.clientPhone || !bookingData.serviceId || !selectedTime) {
      setError('Completa todos los campos');
      return;
    }

    setLoading(true);
    try {
      await PublicAPI.call('/public/book', {
        method: 'POST',
        body: JSON.stringify({
          branchId,
          chairId,
          serviceId: bookingData.serviceId,
          clientName: bookingData.clientName,
          clientPhone: bookingData.clientPhone,
          date: selectedDate,
          time: selectedTime
        })
      });
      
      // Show confirmation notification
      showAppointmentConfirmation({
        serviceId: bookingData.serviceId,
        date: selectedDate,
        time: selectedTime
      });
      
      setStep('success');
    } catch (err) {
      setError('Error al agendar: ' + err.message);
    }
    setLoading(false);
  };

  if (!branchData || !chairData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{branchData.name}</h1>
            <p className="text-gray-600">Silla {chairData.chair_number}</p>
          </div>
        </div>

        {step === 'welcome' && (
          <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">¡Bienvenido!</h1>
            <h2 className="text-xl font-semibold text-gray-700 mb-6">{branchData.shop_name}</h2>
            <p className="text-gray-600 mb-8">Silla {chairData.chair_number}</p>
            
            <div className="space-y-4">
              <button
                onClick={() => setStep('schedule')}
                className="w-full bg-blue-600 text-white py-4 rounded-2xl font-semibold text-lg active:scale-[0.98] transition-all"
              >
                Nueva cita
              </button>
              
              <button
                onClick={() => setStep('findAppointment')}
                className="w-full bg-gray-100 text-gray-700 py-4 rounded-2xl font-semibold text-lg active:scale-[0.98] transition-all"
              >
                Modificar mi cita
              </button>
            </div>
          </div>
        )}

        {step === 'findAppointment' && (
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <button
              onClick={() => setStep('welcome')}
              className="flex items-center gap-2 text-gray-600 mb-4"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver
            </button>
            
            <h3 className="text-lg font-bold text-gray-900 mb-4">Buscar mi cita</h3>
            <p className="text-gray-600 text-sm mb-6">Ingresa el teléfono con el que agendaste tu cita</p>
            
            <div className="mb-6">
              <input
                type="tel"
                value={clientPhone}
                onChange={e => setClientPhone(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-xl"
                placeholder="Número de teléfono"
              />
            </div>
            
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}
            
            <button
              onClick={findClientAppointments}
              disabled={loading || !clientPhone}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold text-sm active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {loading ? 'Buscando...' : 'Buscar citas'}
            </button>
          </div>
        )}

        {step === 'manage' && (
          <div className="space-y-4">
            <button
              onClick={() => setStep('welcome')}
              className="flex items-center gap-2 text-gray-600 mb-4"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver
            </button>
            
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Mis citas</h3>
              
              {clientAppointments.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No tienes citas programadas</p>
              ) : (
                <div className="space-y-3">
                  {clientAppointments.map(appt => {
                    const service = services.find(s => s.id === appt.service_id);
                    return (
                      <div key={appt.id} className="border border-gray-200 rounded-xl p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <p className="font-semibold text-gray-900">{service?.name}</p>
                            <p className="text-sm text-gray-600">{format(new Date(appt.appointment_date + 'T12:00:00'), 'd MMM yyyy', { locale: es })}</p>
                            <p className="text-sm text-gray-600">{appt.appointment_time}</p>
                          </div>
                          <span className={`px-2 py-1 rounded-lg text-xs ${
                            appt.status === 'scheduled' ? 'bg-blue-50 text-blue-600' :
                            appt.status === 'completed' ? 'bg-green-50 text-green-600' :
                            'bg-red-50 text-red-600'
                          }`}>
                            {appt.status === 'scheduled' ? 'Programada' : 
                             appt.status === 'completed' ? 'Completada' : 'Cancelada'}
                          </span>
                        </div>
                        
                        {appt.status === 'scheduled' && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                // Set up reschedule data and go to schedule view
                                setBookingData({
                                  clientName: appt.client_name,
                                  clientPhone: appt.client_phone,
                                  serviceId: appt.service_id
                                });
                                setSelectedDate(appt.appointment_date.split('T')[0]);
                                setStep('schedule');
                              }}
                              className="flex-1 bg-blue-500 text-white py-2 rounded-lg text-xs font-medium active:scale-[0.98] transition-all"
                            >
                              Reagendar
                            </button>
                            <button
                              onClick={() => {
                                if (confirm('¿Estás seguro de cancelar esta cita?')) {
                                  cancelClientAppointment(appt.id);
                                }
                              }}
                              className="flex-1 bg-red-500 text-white py-2 rounded-lg text-xs font-medium active:scale-[0.98] transition-all"
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
          </div>
        )}

        {step === 'schedule' && (
          <div className="space-y-6">
            {/* Service Selection */}
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h3 className="text-black text-lg font-semibold mb-4">Selecciona un servicio</h3>
              <div className="space-y-3">
                {services.map(service => (
                  <button
                    key={service.id}
                    onClick={() => setBookingData({...bookingData, serviceId: service.id})}
                    className={`w-full p-4 rounded-xl border-2 transition-all ${
                      bookingData.serviceId === service.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <div className="text-left">
                        <p className="font-semibold text-gray-900">{service.name}</p>
                        <p className="text-sm text-gray-500">{service.duration} minutos</p>
                      </div>
                      <p className="font-bold text-blue-600">${service.price}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Date Selection */}
            {bookingData.serviceId && (
              <div className="bg-white rounded-2xl p-6 shadow-sm">
                <h3 className="text-black text-lg font-semibold mb-4">Selecciona una fecha</h3>
                <input
                  type="date"
                  value={selectedDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={e => {
                    setSelectedDate(e.target.value);
                    setSelectedTime('');
                  }}
                  className="text-black w-full p-3 border border-gray-300 rounded-xl"
                />
              </div>
            )}

            {/* Time Selection */}
            {bookingData.serviceId && selectedDate && (
              <div className="bg-white rounded-2xl p-6 shadow-sm">
                <h3 className="text-black text-lg font-semibold mb-4">Horarios disponibles</h3>
                {loading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                  </div>
                ) : availableSlots.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">No hay horarios disponibles</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {availableSlots.map(slot => (
                      <button
                        key={slot.time}
                        onClick={() => setSelectedTime(slot.time)}
                        className={`p-3 rounded-xl text-sm font-medium transition-all ${
                          selectedTime === slot.time
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {slot.display}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {selectedTime && (
              <button
                onClick={() => setStep('book')}
                className="w-full bg-blue-600 text-white py-4 rounded-2xl font-semibold text-lg active:scale-[0.98] transition-all"
              >
                Continuar
              </button>
            )}
          </div>
        )}

        {step === 'book' && (
          <div className="space-y-6">
            <button
              onClick={() => setStep('schedule')}
              className="flex items-center gap-2 text-gray-600 mb-4"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver
            </button>

            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h3 className="text-black text-lg font-semibold mb-4">Confirma tu cita</h3>
              
              <div className="bg-blue-50 rounded-xl p-4 mb-6">
                <div className="flex items-center gap-3 mb-2">
                  <Calendar className="w-5 h-5 text-blue-600" />
                  <span className="text-blue-600 font-semibold">
                    {format(new Date(selectedDate + 'T12:00:00'), 'EEEE, d MMMM yyyy', { locale: es })}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-blue-600" />
                  <span className="text-blue-600 font-semibold">{selectedTime}</span>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-black block text-sm font-medium mb-2">Tu nombre</label>
                  <input
                    type="text"
                    value={bookingData.clientName}
                    onChange={e => setBookingData({...bookingData, clientName: e.target.value})}
                    className="text-black w-full p-3 border border-gray-300 rounded-xl"
                    placeholder="Nombre completo"
                  />
                </div>

                <div>
                  <label className="text-black block text-sm font-medium mb-2">Tu teléfono</label>
                  <input
                    type="tel"
                    value={bookingData.clientPhone}
                    onChange={e => setBookingData({...bookingData, clientPhone: e.target.value})}
                    className="text-black w-full p-3 border border-gray-300 rounded-xl"
                    placeholder="Número de teléfono"
                  />
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 mt-4">
                  <p className="text-red-600 text-sm">{error}</p>
                </div>
              )}

              <button
                onClick={handleBooking}
                disabled={loading}
                className="w-full bg-blue-600 text-white py-4 rounded-2xl font-semibold text-lg mt-6 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {loading ? 'Agendando...' : 'Confirmar cita'}
              </button>
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">¡Cita agendada!</h3>
            <p className="text-gray-600 mb-6">
              Tu cita ha sido confirmada para el {format(new Date(selectedDate + 'T12:00:00'), 'd MMMM yyyy', { locale: es })} a las {selectedTime}
            </p>
            <p className="text-sm text-gray-500">
              Recibirás una confirmación y podrás gestionar tu cita desde este enlace.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PublicBooking;