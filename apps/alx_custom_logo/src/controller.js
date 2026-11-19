// SPDX-License-Identifier: MIT
'use strict';
const EventEmitter = require('events');
const probe = require('./probe.js').probe;
const words = {
    ru: { start: 'Проверить подключение', stop: 'Остановить проверку', prev: 'Предыдущая страница', next: 'Следующая страница',
        idle: 'Проверка ещё не запускалась', running: 'Проверка подключения…', ok: 'Подключение проверено', failed: 'Проверка не пройдена',
        cancelled: 'Проверка остановлена', note: 'Логотип не выводится. Настройки не меняются.', parked: 'Запускайте проверку на стоящей машине.',
        page: 'Отчёт', noReport: 'Нажмите «Проверить подключение».', timeout: 'Нет ответа за 5 секунд.',
        ENOENT: 'Сокет cluster-render не найден.', EACCES: 'Нет доступа к сокету cluster-render.', ECONNREFUSED: 'cluster-render не принимает соединение.' },
    en: { start: 'Check connection', stop: 'Stop check', prev: 'Previous page', next: 'Next page',
        idle: 'Not checked yet', running: 'Checking connection…', ok: 'Connection checked', failed: 'Check failed',
        cancelled: 'Check stopped', note: 'No logo is drawn. No settings are changed.', parked: 'Run this check while parked.',
        page: 'Report', noReport: 'Select Check connection.', timeout: 'No response within 5 seconds.',
        ENOENT: 'cluster-render socket not found.', EACCES: 'No access to the cluster-render socket.', ECONNREFUSED: 'cluster-render is not accepting connections.' }
};
function lines(text) {
    const out = [];
    String(text).slice(0, 8192).split(/\r?\n/).forEach(line => {
        line = line.replace(/[\x00-\x1f\x7f]/g, ' ').trim();
        while (line.length) { out.push(line.slice(0, 64)); line = line.slice(64); }
    });
    return out.slice(0, 128);
}
class Controller extends EventEmitter {
    constructor(runProbe) {
        super();
        this.runProbe = runProbe || probe;
        this.language = 'ru'; this.state = 'idle'; this.report = []; this.page = 0;
        this.run = null; this.visible = false; this.closed = false; this.generation = 0;
    }
    setVisible(visible) { this.visible = visible; if (!visible) this.cancel(); }
    toggleLanguage() { this.language = this.language === 'ru' ? 'en' : 'ru'; this.emit('change'); }
    turn(delta) { this.page = Math.max(0, Math.min(this.pages() - 1, this.page + delta)); this.emit('change'); }
    pages() { return Math.max(1, Math.ceil(this.report.length / 4)); }
    start() {
        if (!this.visible || this.closed || this.run) return;
        const generation = ++this.generation;
        this.state = 'running'; this.page = 0; this.report = ['Node ' + process.version];
        let lastError = '';
        try {
            const run = this.runProbe({ socket: '/dev/shm/cluster-render/render.sock', timeoutMs: 5000 }, event => {
                if (generation !== this.generation) return;
                if (event.event === 'connection_error') lastError = String(event.data);
                if (event.event === 'connected') this.report.push('Socket connected: ' + event.elapsedMs + ' ms');
                if (event.event === 'renderer_event' && event.data.ev === 'hello') {
                    this.report = this.report.concat(lines('Backend: ' + event.data.backend + '\nProtocol: ' + event.data.proto + '\nTargets: ' + event.data.targets));
                }
                if (event.event === 'renderer_event' && event.data.ev === 'status') this.report = this.report.concat(lines(event.data.text));
                if (event.event === 'protocol_ready') this.report.push('Hello received: ' + event.elapsedMs + ' ms');
                this.report = this.report.slice(0, 128);
            });
            this.run = run;
            this.emit('change');
            run.result.then(result => {
                if (generation !== this.generation) return;
                this.run = null; this.state = result.ok ? 'ok' : 'failed';
                const w = words[this.language];
                const reason = w[lastError] || (result.reason === 'Diagnostic deadline exceeded' ? w.timeout : result.reason);
                this.report = lines(reason).concat(this.report).slice(0, 128);
                this.emit('change');
            }).catch(err => this.failure(generation, err));
        } catch (err) { this.failure(generation, err); }
    }
    failure(generation, err) {
        if (generation !== this.generation) return;
        if (this.run) this.run.stop();
        this.run = null; this.state = 'failed'; this.report = lines(err.message); this.emit('change');
    }
    cancel() {
        if (!this.run) return;
        const run = this.run; this.run = null; ++this.generation;
        run.stop(); this.state = 'cancelled'; this.emit('change');
    }
    close() { this.closed = true; this.visible = false; this.cancel(); }
    view() {
        const w = words[this.language];
        const rows = this.report.slice(this.page * 4, this.page * 4 + 4);
        return { status: w[this.state], note: w.note, parked: w.parked,
            start: w.start, stop: w.stop, prev: w.prev, next: w.next,
            language: this.language === 'ru' ? 'Language: English' : 'Язык: Русский',
            page: w.page + ' ' + (this.page + 1) + '/' + this.pages(),
            rows: rows.length ? rows : [w.noReport],
            canStart: this.visible && !this.closed && !this.run, canStop: !!this.run,
            canPrev: this.page > 0, canNext: this.page + 1 < this.pages() };
    }
}
module.exports = { Controller: Controller, lines: lines };
