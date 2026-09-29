# Reactor ATR 2D — Producción de H₂ por reformado autotérmico de bioetanol

Simulador interactivo de un reactor de lecho empacado catalítico 2D axisimétrico
(r, z), no isotérmico, en estado estacionario, para reformado autotérmico (ATR)
de bioetanol. Resuelve numéricamente el sistema de EDPs (balance de materia,
balance de energía, caída de presión de Ergun) con cinética mecanística
Langmuir–Hinshelwood–Hougen–Watson (LHHW) y actualiza el resultado en tiempo
real ante cada cambio de los controles de la interfaz.

Este repositorio es el **Entregable 2, 3 y 4** de la arquitectura solicitada
(carpetas del proyecto, backend numérico, componente React interactivo). El
**Entregable 1** (resumen de la formulación matemática y tabla de parámetros
cinéticos/físicos) está en [`docs/formulacion_matematica_y_parametros.docx`](docs/formulacion_matematica_y_parametros.docx).

## Arquitectura de carpetas

```
atr-h2-reactor-2d/
├── backend/                     Node.js / Express — resolvedor numérico + API + SQLite
│   ├── server.js                Punto de entrada del servidor HTTP
│   ├── src/
│   │   ├── kinetics/
│   │   │   ├── reactions.js     Red de 5 reacciones, termodinámica (ΔH, S°, Cp), especies
│   │   │   ├── catalysts.js     Catálogo de 4 catalizadores: Arrhenius, adsorción, lecho
│   │   │   └── rates.js         Leyes de velocidad LHHW, Keq(T), Van't Hoff, Arrhenius
│   │   ├── solver/
│   │   │   ├── properties.js    Propiedades de mezcla (Cp, μ, λ, ρ) y transporte radial
│   │   │   ├── pde2d.js         Solver MOL 2D axisimétrico (IMEX: RK4 + difusión implícita)
│   │   │   ├── inverseSolve.js  Problema inverso: biseccion sobre T para un %H2 objetivo
│   │   │   ├── workerPool.js    Pool de worker_threads (cómputo fuera del hilo de Express)
│   │   │   ├── worker.js        Script ejecutado en cada worker
│   │   │   └── selftest.js      Script de verificación rápida del solver (balance de masa, KPIs)
│   │   ├── db/
│   │   │   ├── schema.sql       Esquema SQLite (catalizadores, cinética, adsorción, historial)
│   │   │   └── database.js      Conexión, sembrado desde el catálogo JS, consultas
│   │   └── routes/
│   │       ├── simulate.js      POST /api/simulate
│   │       ├── catalysts.js     GET  /api/catalysts, /api/catalysts/catalog
│   │       ├── sensitivity.js   POST /api/sensitivity
│   │       ├── inverseYield.js  POST /api/inverse-yield (problema inverso: %H2 -> T)
│   │       └── history.js       GET/DELETE /api/history
│   └── data/                    Base SQLite (se crea automáticamente al arrancar)
│
├── frontend/                    React + TypeScript + TailwindCSS + Recharts
│   └── src/
│       ├── components/
│       │   ├── ControlPanel.tsx           Deslizadores + menú desplegable de catalizador
│       │   ├── KPIPanel.tsx               Y_H2, %H2 seco, flujos molares/másicos de salida
│       │   ├── AxialProfileChart.tsx      Conversión de EtOH y rendimiento de H2 vs z
│       │   ├── TemperatureProfileChart.tsx Perfil axial (hotspot/coldspot) y radial de T
│       │   └── SensitivityPanel.tsx       Y_H2 vs T, P, O2/EtOH, S/E
│       ├── api/client.ts        Cliente fetch tipado hacia el backend
│       ├── theme.ts             Paleta de colores (validada, accesible para daltonismo)
│       └── types.ts             Tipos TypeScript espejo de las respuestas del backend
│
└── docs/
    └── formulacion_matematica_y_parametros.docx   Entregable 1
```

## Cómo ejecutar

Requiere Node.js 18+ (probado con Node 22).

```bash
# Backend (API + solver + SQLite) — puerto 4000
cd backend
npm install
npm start
# (opcional) prueba rápida del solver sin levantar el servidor:
npm run test:solver

# Frontend (React + Vite) — puerto 5173, con proxy a /api hacia :4000
cd ../frontend
npm install
npm run dev
```

Abrir `http://localhost:5173`. Para producción, `npm run build` en `frontend/`
genera `frontend/dist/` (servirlo con cualquier servidor estático, o detrás de
un reverse proxy que enrute `/api` al backend).

## Referencia de la API

| Método | Ruta | Descripción |
|---|---|---|
| `GET`  | `/api/health` | Estado del servicio |
| `GET`  | `/api/catalysts` | Lista de catalizadores (para el menú desplegable) |
| `GET`  | `/api/catalysts/catalog` | Catálogo completo (cinética + adsorción) desde SQLite |
| `POST` | `/api/simulate` | Ejecuta la simulación 2D completa (ver payload abajo) |
| `POST` | `/api/sensitivity` | Barrido paramétrico (T, P, O2/EtOH o S/E) de Y_H2 |
| `POST` | `/api/inverse-yield` | Problema inverso: dado un %H2 objetivo, busca T (ver payload abajo) |
| `GET`  | `/api/history?limit=50` | Historial de simulaciones guardadas en SQLite |
| `DELETE` | `/api/history` | Limpia el historial |

Payload de `POST /api/simulate`:

```json
{
  "catalyst": "nicoce",
  "T_in_C": 600,
  "P_in_bar": 1.5,
  "O2_EtOH": 0.4,
  "S_E": 3.5,
  "W_F_EtOH": 30,
  "wall": { "adiabatic": true }
}
```

`catalyst` ∈ `{"none", "nico", "nicoce", "hydrotalcite"}`. Con `catalyst:"none"`,
`W_F_EtOH` se reinterpreta como tiempo de residencia τ (s) en vez de espacio-tiempo
W/F (ver `docs/formulacion_matematica_y_parametros.docx`, Sección 3). El objeto
`wall` es opcional (por defecto adiabático); para pared no adiabática:
`{"adiabatic": false, "U_t": 25, "T_wall_C": 500}`.

La respuesta incluye `kpis` (Y_H2, %H2 seco, conversión, hotspot/coldspot,
caída de presión), `outlet` (flujos molares/másicos por especie), `axialProfile`
(perfil 0–40 cm) y `radialSnapshots` (perfiles radiales de T en varias z).

Payload de `POST /api/inverse-yield` (problema inverso — "quiero este %H2,
¿a qué temperatura lo consigo?"):

```json
{
  "targetYH2Pct": 45,
  "catalyst": "nicoce",
  "P_in_bar": 1.5,
  "O2_EtOH": 0.4,
  "S_E": 3.5,
  "W_F_EtOH": 30
}
```

No se envía `T_in_C`: el backend hace una búsqueda por bisección sobre
corridas reales del solver 2D (no una interpolación) en el rango 300–900 °C,
asumiendo la tendencia monótona creciente de Y_H2 con T verificada en el
barrido de sensibilidad, dejando fijas las demás variables. La respuesta
incluye `T_in_C` (la temperatura encontrada), `achieved` (si el objetivo es
alcanzable con las demás variables tal como están), `achievedYH2Pct`,
`bounds` (Y_H2 en los extremos T=300 °C y T=900 °C) y `result` (la corrida
completa del solver en esa T, mismo formato que `/api/simulate`). Si el
objetivo pedido queda fuera del rango alcanzable, `T_in_C` se satura en el
extremo más cercano y `achieved:false` señala que se muestra el valor más
próximo posible, no el exacto.

## Notas de diseño relevantes

- **Tiempo real**: el solver corre en `worker_threads` separados del hilo
  principal de Express, así una simulación pesada o un barrido de sensibilidad
  no bloquean las demás peticiones concurrentes.
- **Consistencia termodinámica**: las 5 reacciones y sus ΔH se derivaron de la
  misma tabla de entalpías de formación, de modo que el balance de energía y el
  de materia sean exactamente consistentes (balance atómico C/H/O verificado
  numéricamente, ver `src/solver/selftest.js`).
- **Modo objetivo de rendimiento (problema inverso)**: en la interfaz, el
  interruptor "Modo objetivo de rendimiento" reemplaza el deslizador manual
  de T por uno de Y_H2 objetivo; el frontend llama a `/api/inverse-yield` y
  las demás variables (KPIs, flujos, perfiles axial/radial) se recalculan de
  forma coherente con la T que resuelve el objetivo. La búsqueda usa
  resolución completa del solver en cada punto (no el modo rápido de los
  barridos de sensibilidad), para que el %H2 mostrado coincida exactamente
  con el que produciría `/api/simulate` a esa misma T.
- **Calibración**: todos los parámetros cinéticos y de adsorción están
  centralizados en `src/kinetics/catalysts.js` (y replicados en SQLite al
  arrancar) — recalibrar contra datos experimentales es un cambio de datos, no
  de código.
