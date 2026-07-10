## 1. Backend — Secreto JWT estable

- [x] 1.1 En `backend/src/main/resources/application.yml`, cambiar el valor por defecto de `app.jwt.secret` de vacío a `dGVzdC1kZXYtand0LXNlY3JldC1kby1ub3QtdXNlLWluLXByb2R1Y3Rpb24=`
- [x] 1.2 Verificar que el backend arranca sin `JWT_SECRET` y que el log ya no muestra el warning de clave efímera

## 2. Frontend — Manejo de respuestas 401

- [x] 2.1 En `frontend/src/app/services/auth.interceptor.ts`, añadir un operador `catchError` que detecte `HttpErrorResponse` con `status === 401`, llame a `AuthService.logout()` y navegue a `/login` mediante `Router`
- [x] 2.2 Asegurarse de que el 401 en `/api/auth/login` no activa la redirección (excluirlo igual que se excluye en el path de envío del token)

## 3. Verificación

- [x] 3.1 Arrancar el backend sin `JWT_SECRET`, hacer login, reiniciar el backend y comprobar que una nueva petición a `/ingest` devuelve 202 (no 401) con el mismo token
- [x] 3.2 Con `JWT_SECRET` configurado, repetir el ciclo anterior y verificar el mismo comportamiento
- [x] 3.3 Simular una respuesta 401 en el frontend (token inválido en localStorage) y comprobar que la app redirige a `/login`
- [x] 3.4 Verificar que unas credenciales incorrectas en `/login` muestran error en el formulario y no redirigen ni limpian estado
