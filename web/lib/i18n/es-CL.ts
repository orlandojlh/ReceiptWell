const t = {
  app: {
    name: "ReceiptWell",
    tagline: "Entiende tu gasto en el supermercado",
  },
  auth: {
    email: "Correo electrónico",
    password: "Contraseña",
    login: "Iniciar sesión",
    register: "Crear cuenta",
    loginTitle: "Bienvenido de vuelta",
    registerTitle: "Crea tu cuenta gratis",
    noAccount: "¿No tienes cuenta?",
    hasAccount: "¿Ya tienes cuenta?",
    googleButton: "Continuar con Google",
    googleDisabled: "Disponible en el lanzamiento",
    loggingIn: "Ingresando…",
    registering: "Creando cuenta…",
    logOut: "Cerrar sesión",
  },
  errors: {
    generic: "Ocurrió un error. Intenta de nuevo.",
    invalidCredentials: "Correo o contraseña incorrectos.",
    emailTaken: "Ya existe una cuenta con ese correo.",
  },
  nav: {
    dashboard: "Inicio",
    upload: "Subir boleta",
    premium: "Premium",
  },
} as const;

export default t;
