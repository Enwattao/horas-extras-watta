# Horas Extras — App Android

App de control de horas extras para tablet Android.
Funciona 100% offline · IndexedDB · React + Vite + Capacitor

---

## ESTRUCTURA DE ARCHIVOS

```
horas-app/
├── src/
│   ├── AppMovil.jsx     ← toda la app
│   ├── db.js            ← base de datos IndexedDB
│   └── main.jsx         ← punto de entrada
├── index.html
├── package.json
├── vite.config.js
└── capacitor.config.json
```

---

## INSTALACIÓN DESDE CERO

### 1. Descargar los archivos
Copia la carpeta `horas-app` en:
```
C:\Users\[tu_usuario]\Downloads\horas-app\
```

### 2. Abrir terminal en esa carpeta
```
cd C:\Users\[tu_usuario]\Downloads\horas-app
```

### 3. Instalar dependencias
```
npm install
```

### 4. Probar en el navegador (opcional)
```
npm run dev
```
Abre http://localhost:5173 para verla en el navegador.

---

## COMPILAR COMO APK ANDROID

### Requisitos previos
- Node.js 18+ instalado
- Android Studio instalado (con SDK y un AVD configurado)
- Java JDK 17

### Paso 1 — Inicializar Capacitor (solo la primera vez)
```
npx cap init "Horas Extras" "com.empresa.horasextras" --web-dir dist
npx cap add android
```

### Paso 2 — Compilar y sincronizar
```
npm run build
npx cap sync
```

### Paso 3 — Abrir Android Studio
```
npx cap open android
```

### Paso 4 — Generar APK en Android Studio
1. Menú: Build → Build Bundle(s) / APK(s) → Build APK(s)
2. Espera a que compile
3. Clic en "locate" cuando termine
4. El APK estará en: `android/app/build/outputs/apk/debug/app-debug.apk`

### Paso 5 — Instalar en la tablet
- Copia el APK a la tablet por USB o email
- En la tablet: Ajustes → Seguridad → Permitir fuentes desconocidas
- Abre el APK para instalar

---

## CADA VEZ QUE MODIFICAS CÓDIGO

```
npm run build
npx cap sync
```
Luego en Android Studio: Build → Build APK(s)

---

## LO QUE HACE LA APP

- **Menú principal** con 6 botones grandes táctiles
- **Registrar horas**: elige operario, montaje, fecha, horas y nota
- **Ver registros**: filtra por operario, montaje o fecha exacta
- **Operarios**: añadir/editar/borrar con color asignado
- **Montajes**: añadir/editar/borrar con código de obra y color
- **Exportar PDF**: por día, mes o año — con filtro por operario y montaje
- **Ajustes**: modo oscuro, letras grandes, borrar registros

---

## TECNOLOGÍA

| Cosa | Tecnología |
|------|-----------|
| Framework | React 18 + Vite 5 |
| Base de datos | IndexedDB (offline, local) |
| PDF | jsPDF |
| APK | Capacitor 6 |
| Estilos | CSS inline (sin dependencias) |
| Sonidos | Web Audio API (sin archivos) |
