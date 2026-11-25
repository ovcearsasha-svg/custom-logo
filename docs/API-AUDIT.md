# Проверка реальных исходников

Дата проверки: 2026-11-25. Предыдущий разговор использовался только как контекст;
ни протокол, ни лимиты из него не принимались без проверки.

## Зафиксированные версии

- Пользовательский репозиторий: `66ddad2ee2f477a7703410a6619e4b082d116441`.
- [bimmer-lab/apps](https://github.com/bimmer-lab/apps/tree/68a29e5a8bcc9ec71c0764b2598920b85a2f664a).
- [idrive-apps / cluster-render 0.8.14](https://github.com/robertnisipeanu/idrive-apps/tree/b0f823765d4b1c8369d71982f797803414aad93e/native/cluster-render).
- [MGU Store](https://github.com/robertnisipeanu/mgu-store/tree/37702a880f1ed5fd346f4c944127fb276920be9c).

Минимальное требование пакета — 0.8.14, то есть исследованная версия.
Совместимость более старых версий (в том числе 0.5.1 из старого разговора)
не проверялась и не заявляется.

## Протокол и слой

Источник: [PROTOCOL.md](https://github.com/robertnisipeanu/idrive-apps/blob/b0f823765d4b1c8369d71982f797803414aad93e/native/cluster-render/PROTOCOL.md).
Unix stream socket `/dev/shm/cluster-render/render.sock`, группа `tm_oap_app`.
Протокол 1, префикс u32 LE, тип J/F/M. PNG напрямую не поддерживается:
изображение передаётся как RGBA8 **straight alpha**, не premultiplied.

Мы не реализуем этот протокол: vendored официальный
[JS-клиент](https://github.com/robertnisipeanu/idrive-apps/blob/b0f823765d4b1c8369d71982f797803414aad93e/native/cluster-render/js/cluster_render_client.js)
предоставляет `image`, `pixels`, `connect`, `drop`, `close`.
SHA256 канонического файла Git (LF):
`345e7b9e93bae1f7eedead7c710d8fc01fa5fda18d8866b9592b318d5dbedb43`.

Пиксели сохраняются до первого подключения. `_replay` восстанавливает слой,
`_pump` отправляет сохранённое изображение после hello. Не вызываем `pixels`
из обработчика `ready`: это создало бы повторную отправку, потому что клиент
уже сделал replay перед событием. В 0.2.0 текстура 512×512 — 1 048 576 байт RGBA;
на отправку F добавляются 19 байт заголовков. JSON hello/layer идут отдельно.

В [src/layer.cpp](https://github.com/robertnisipeanu/idrive-apps/blob/b0f823765d4b1c8369d71982f797803414aad93e/native/cluster-render/src/layer.cpp)
`ImageLayer::stage` возвращает Idle при отсутствии whole/dirty, а `committed`
сбрасывает изменения. Изображения не имеют video `stall_ms`: keepalive-кадры
не нужны. При пересоздании графического буфера сервер сам загружает сохранённые
пиксели. Это не означает остановку обычного рендеринга экрана BMW.

В [src/server.cpp](https://github.com/robertnisipeanu/idrive-apps/blob/b0f823765d4b1c8369d71982f797803414aad93e/native/cluster-render/src/server.cpp)
`Server::drop_client` вызывает `comp_->remove_owner(c.id)`.
Слой НЕ переживает отключение владельца. Поэтому небольшой процесс остаётся
запущенным; завершение сразу после загрузки PNG неверно.

## Waze, штатная графика и предупреждения

[README рендерера, Targets / Arbitration](https://github.com/robertnisipeanu/idrive-apps/blob/b0f823765d4b1c8369d71982f797803414aad93e/native/cluster-render/README.md):
ID7 `panel` — слот 0x203, 1920×720; `map` — 0x100, 1088×480.
[Waze configuration](https://github.com/robertnisipeanu/idrive-apps/blob/b0f823765d4b1c8369d71982f797803414aad93e/native/waze-on-cluster/waze-on-cluster.conf)
подтверждает отдельный центральный map-слот.

Наш слой — `panel`, `overlay`, z=0, exclusive=0, contend=0, prewarm=0, preload=0.
Никаких scene/host/unhost, управления map/HUD, ограничения others_fps, рестартов
рендерера или правок Waze. Не запрашиваем слот повторно после его захвата штатной
системой. В состоянии waiting/suspended ничего не перерисовываем и не форсируем.
Следствие: логотип может отсутствовать, пока слот занят; это намеренно.

Однако README прямо указывает, что показ panel убирает штатный медиавиджет
0x200. Прозрачность картинки этого не отменяет. Произвольные координаты могут
накрыть важный штатный элемент; пример координат не является калибровкой.
Полная визуальная совместимость с Waze и DKOMBI4 не доказана локальными тестами.
Обработка блокировки слотов во время предупреждений остаётся у рендерера.

## Store и жизненный цикл

Используются выбранные неизменённые build tools из bimmer-lab App Kit. Их
[build.py](https://github.com/bimmer-lab/apps/blob/68a29e5a8bcc9ec71c0764b2598920b85a2f664a/kit/tools/build.py)
преобразует `autostart: true` в `package.json: mguAppStartType: autostart`.
[mgu-deploy.js](https://github.com/robertnisipeanu/mgu-store/blob/37702a880f1ed5fd346f4c944127fb276920be9c/deploy/unit/mgu-deploy.js)
принимает это поле и регистрирует автозапуск; платформенный менеджер управляет
стартом и остановкой. Приложение не создаёт собственную systemd-службу.

Из [kit/runtime/mgu.js](https://github.com/bimmer-lab/apps/blob/68a29e5a8bcc9ec71c0764b2598920b85a2f664a/kit/runtime/mgu.js)
проверены `OnlineApp.start()`, `appStatusProxyReady`, `registerActive()` и
`shutdown`. Используем тонкий адаптер; полный runtime, Canvas, web UI и
периодические задачи App Kit не включены. Ошибка запуска отключает логотип,
не вызывает аварийный exit: upstream предупреждает о CorruptAppsHandler.

[sources.js / repoCatalog](https://github.com/robertnisipeanu/mgu-store/blob/37702a880f1ed5fd346f4c944127fb276920be9c/native/mgu-updater/js/sources.js)
читает `requires` и `uninstallable` из app.json в режиме `mgu-repo.json/apps`.
`release.json` относится к другой схеме публикации и здесь не используется.
Это проверено запуском реального парсера над нашим репозиторием.

В 0.2.0 добавлен один нативный RHMI-экран. Вызовы getByName, setValue,
action, updateResources, mapEntryState/openEntryState, applicationStackChanged,
registerHmiVisible/unregisterHmiVisible и initialized проверены по тому же
kit/runtime/mgu.js. Меню работает по событиям, без цикла отрисовки.
Структура экрана и вызовы проверены локально, настоящий SDK не запускался.
Нельзя представлять предварительный релиз как проверенный на автомобиле.

Координаты x/y в src/server.cpp принимаются от -4096 до 4096. Наши ограничения
уже: холст должен хотя бы частично пересекать panel. Отрицательные координаты
нужны для прозрачных полей исходного PNG. Масштаб/перемещение используют set,
не повторную загрузку пикселей. Исходник 2000×2000 хранится неизменным; при сборке
создаётся уменьшенная текстура всего холста, без обрезки и ретуши.

## Удаление

На уровне приложения stop идемпотентен: drop собственного ref + close,
закрытие отменяет reconnect timer. При потере процесса сокет закрывается ОС.
Сервер удаляет все ресурсы только этого владельца. Slot linger/fade — серверные.

Функция `uninstallApp` в mgu-deploy удаляет собственную регистрацию и каталог
приложения. В 0.2.0 настройки сохраняются в data/custom-logo-settings.json
только по кнопке, атомарным переименованием временного файла. Хуков и служб нет.
Рендерер — общая зависимость Waze, не наша собственность; его нельзя включать
в удаление приложения. FDL-кодирование eDrive не меняется и не откатывается.
