# Inversión Derechos en California

Sitio estático con el panorama general del gasto en publicidad de la marca. Lee todos sus datos de `data/gastos.json` — no hay backend ni base de datos.

## Cómo actualizar el gasto (por ejemplo, agregar el 20–31 de agosto)

1. Abre `data/gastos.json`.
2. Agrega un nuevo objeto dentro del arreglo `"movimientos"`. Cada movimiento necesita:
   - `id`: un identificador único, sin espacios (ej. `"p3-meta-25ago"`).
   - `categoria`: uno de `google-ads`, `meta-ads`, `tiktok`, `vps` (ver la lista en `"categorias"` al inicio del archivo).
   - `importe`: el monto en pesos (número, sin signo de $ ni comas).
   - `exacto`: `true` si el monto corresponde a ese día exacto, `false` si es un total de un periodo más amplio.
   - Fecha: si es un día exacto usa `"fecha": "2026-08-25"`. Si es un total de periodo usa `"fechaInicio"` y `"fechaFin"`.
   - `fuente`: de qué reporte sale (ej. `"Reporte 20–31 ago 2026"`).
   - `nota`: una frase corta explicando el dato (opcional pero recomendado).
3. Guarda el archivo. El sitio se actualiza solo — no hay que tocar el HTML ni el JavaScript.

**Regla de oro:** nunca inventes un monto. Si un reporte no trae el gasto de un día específico, usa `fechaInicio`/`fechaFin` con `"exacto": false` y el total real de ese tramo, tal como está en el reporte original.

Si hay fechas sin ningún reporte (como pasó del 16 al 24 de julio de 2026), regístralas en el arreglo `"huecos"` al inicio del archivo — así el sitio avisa que faltan datos en vez de mostrar $0.

## Ver el sitio en tu computadora antes de publicarlo

Los navegadores bloquean la carga de `data/gastos.json` si simplemente abres `index.html` con doble clic (por seguridad, `fetch` no funciona con archivos locales sueltos). Para probarlo local, levanta un servidor simple desde esta carpeta:

```
python -m http.server 8000
```

y abre `http://localhost:8000` en el navegador. (Si no tienes Python, cualquier servidor estático sirve — por ejemplo `npx serve`.)

## Publicar con GitHub Pages

1. Sube este repositorio a GitHub (repositorio público).
2. En GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, rama `main`, carpeta `/ (root)`.
3. GitHub te da una URL tipo `https://tu-usuario.github.io/inversion-derechos-california/` — ahí queda publicado y se actualiza solo cada vez que hagas push a `main`.
