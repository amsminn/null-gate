import { Game } from './game/Game';

const container = document.getElementById('app');
if (!container) throw new Error('Missing #app container');

const game = new Game(container);
game.start();

// diagnostics handle (used by the F3 overlay ecosystem and automated smoke tests)
(window as unknown as { NG?: Game }).NG = game;
