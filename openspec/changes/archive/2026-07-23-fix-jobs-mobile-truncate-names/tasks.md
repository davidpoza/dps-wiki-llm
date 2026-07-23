## 1. Arreglar overflow en contenedores flex

- [x] 1.1 Añadir `min-width: 0` a `.file-entry` para que los path-btn puedan comprimirse
- [x] 1.2 Añadir `min-width: 0` a `.scan-activity` para que label y path no expandan el contenedor
- [x] 1.3 Añadir `min-width: 0` a `.phase` para que phase-msg pueda truncarse
- [x] 1.4 Añadir `min-width: 0` a `.concept-proposal-entry` para contener títulos largos

## 2. Truncar textos con ellipsis

- [x] 2.1 Añadir `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` a `.job-id`
- [x] 2.2 Añadir `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` a `.phase-msg`
- [x] 2.3 Añadir `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` a `.concept-title`
- [x] 2.4 Añadir `max-width: 100%` a `.path-btn` (ya tiene overflow/ellipsis/nowrap pero le falta constreñirse al padre)

## 3. Verificación

- [x] 3.1 Comprobar en DevTools con viewport móvil (375px) que no hay scroll horizontal en la vista jobs
- [x] 3.2 Comprobar que los textos largos muestran `...` correctamente
