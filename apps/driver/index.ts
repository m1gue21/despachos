import { registerRootComponent } from 'expo';

// La tarea de ubicación debe definirse en el ámbito global del bundle,
// antes de montar cualquier vista (se ejecuta también sin UI).
import './src/location-task';
import App from './src/App';

registerRootComponent(App);
