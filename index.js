/**
 * @format
 */

import 'react-native-get-random-values';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { runHeadlessUpload } from './src/upload/headlessTask';

AppRegistry.registerComponent(appName, () => App);
AppRegistry.registerHeadlessTask('FieldReportsUpload', () => runHeadlessUpload);
