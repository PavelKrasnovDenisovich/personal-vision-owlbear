# Расширения Owlbear Rodeo для D&D

В репозитории находятся два расширения:

- **Книга партии** — персонажи, заклинания, быстрые броски и боевая панель для мастера.
- **Личный обзор** — персональные настройки видимости и света на сцене.

## Публикация через GitHub Pages

Workflow `.github/workflows/deploy-pages.yml` собирает оба проекта и публикует их при каждом push в `main` или `master`.

1. Создай на GitHub репозиторий и отправь туда содержимое этой папки. Для GitHub Free сделай репозиторий публичным.
2. В GitHub открой **Settings → Pages** и выбери источник **GitHub Actions**.
3. Открой вкладку **Actions** и дождись зелёной галочки у workflow **Build and deploy Owlbear extensions**.
4. Подставь свой логин и имя репозитория в ссылки ниже и добавь нужную ссылку как custom extension в Owlbear Rodeo.

Ссылки на манифесты:

```text
https://ТВОЙ-ЛОГИН.github.io/ИМЯ-РЕПОЗИТОРИЯ/manifest.json
https://ТВОЙ-ЛОГИН.github.io/ИМЯ-РЕПОЗИТОРИЯ/vision/manifest.json
```

Первая ссылка устанавливает «Книгу партии», вторая — «Личный обзор». Имя репозитория в URL должно в точности совпадать с именем репозитория на GitHub.

## Локальная разработка

Нужен Node.js 20 или новее. Установи зависимости отдельно в каждом проекте:

```powershell
cd owlbear-extension
npm ci
npm run dev
```

Для второго расширения используй `vision-extension`. production-сборка каждого проекта создаётся в его папке `dist`; она автоматически попадёт в GitHub Pages после запуска workflow.

## Структура

```text
.
├── .github/workflows/deploy-pages.yml
├── owlbear-extension/  # Книга партии
└── vision-extension/   # Личный обзор
```

Папки `node_modules`, `dist` и ZIP-архивы исключены из Git через `.gitignore`. В GitHub отправляй исходники и файлы workflow; собранный сайт создаётся автоматически.
