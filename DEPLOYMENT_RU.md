# Публикация FindBest.de на Render

## 1. Репозиторий

Загрузите содержимое этой папки в GitHub. Файлы `.env`, `data/`, `*.sqlite` и `*.secret` в архив не входят и не должны попадать в GitHub.

## 2. Web Service

В Render выберите **New → Web Service**, подключите репозиторий и укажите:

- Runtime: **Node**
- Build command: `npm install`
- Start command: `npm start`
- Branch: `main`

После сохранения Render выдаст адрес `https://...onrender.com`.

## 3. Environment

В Render откройте **Environment** и добавьте секреты:

- `SERPER_API_KEY` — ключ Serper, если нужен live-поиск;
- `EBAY_CLIENT_ID` и `EBAY_CLIENT_SECRET` — необязательно;
- `REVIEWS_ADMIN_PASSWORD` — новый длинный пароль администратора, минимум 32 символа;
- `REVIEWS_SECRET` — отдельная случайная строка, минимум 32 символа;
- `REVIEWS_PERSISTENT_STORAGE=true`;
- `REVIEWS_DATA_DIR=/var/data/findbest`;
- `PUBLIC_SITE_URL=https://ваш-адрес.onrender.com`.

Ключи и пароль вводятся только в Render Environment, не в HTML, JavaScript или `.env.example`.

## 4. Постоянное хранение отзывов

В настройках сервиса добавьте **Persistent Disk** с mount path `/var/data`. Без диска отзывы могут исчезнуть после перезапуска контейнера. Если диск ещё не подключён, сайт оставит поиск доступным, но приём отзывов будет закрыт.

## 5. Проверка

Откройте адрес сайта и проверьте поиск. Страница отзывов находится по `/reviews.html`, а модерация — по `/admin-reviews.html`. Новый отзыв сначала имеет статус «На проверке» и появится в публичном списке только после публикации администратором.

При изменении кода достаточно сделать новый commit и push в `main`: Render сам запустит новый deploy. Не удаляйте Persistent Disk и не меняйте `REVIEWS_SECRET`, иначе прежние отзывы и сессии не будут расшифрованы/проверены тем же ключом.
