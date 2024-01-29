/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

/* exported init */

const { Clutter, Gio, Gtk, GLib, GObject, St } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Main = imports.ui.main;
const GnomeSession = imports.misc.gnomeSession;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Me = ExtensionUtils.getCurrentExtension();
const Weather = Me.imports.weather;
const WeatherUtils = Me.imports.utils;

const _ = ExtensionUtils.gettext;

let firstBoot = 1;
let timeCacheCurrentWeather;
let timeCacheForecastWeather;

Gtk.IconTheme.get_default = function() {
    let theme = new Gtk.IconTheme();
    let isGtk3 = !!theme.set_custom_theme;
    if (isGtk3)
        theme.set_custom_theme(St.Settings.get().gtk_icon_theme);
    else
        theme.set_theme_name(St.Settings.get().gtk_icon_theme);
    return theme;
};



const WeatherExt = GObject.registerClass(
class WeatherExt extends PanelMenu.Button {
    _init() {
        super._init(0.0, _('WeatherExt'), false);


        this.weatherIcon = new St.Icon({
            icon_name: 'view-refresh-symbolic',
            style_class: 'system-status-icon myweather-icon'
        });
        this.weatherInfo = new St.Label({
            style_class: 'myweather-label',
            text: _('Loading'),
            y_align: Clutter.ActorAlign.CENTER,
            y_expand: true
        });
        let topBox = new St.BoxLayout({
            style_class: 'panel-status-menu-box'
        });
        topBox.add_child(this.weatherIcon);
        topBox.add_child(this.weatherInfo);
        this.add_child(topBox);

        if (Main.panel.menus === undefined)
            Main.panel.menuManager.addMenu(this.menu);
        else
            Main.panel.menus.addMenu(this.menu);

        // Load settings
        this.loadConfig();
        // Setup network things
        this.idle = false;
        this.connected = false;
        this.networkMonitor = Gio.network_monitor_get_default();

        // Bind signals
        this.presence = new GnomeSession.Presence((proxy, error) => {
            this.onStatusChanged(proxy.status);
        });
        this.presenceConnection = this.presence.connectSignal('StatusChanged', (proxy, senderName, [status]) => {
            this.onStatusChanged(status);
        });
        this.networkMonitorConnection = this.networkMonitor.connect('network-changed', this.onNetworkStateChanged.bind(this));

        this.menu.connect('open-state-changed', this.recalcLayout.bind(this));

        let firstBootWait = this.startupDelay;
        if (firstBoot && firstBootWait != 0) {
            // Delay popup initialization and data fetch on the first
            // extension load, ie: first log in / restart gnome shell
            this.timeoutFirstBoot = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, firstBootWait, () => {
                this.checkConnectionState();
                this.initOpenWeatherUI();
                firstBoot = 0;
                this.timeoutFirstBoot = null;
                return false; // run timer once then destroy
            });
        }
        else {
            this.checkConnectionState();
            this.initOpenWeatherUI();
        }


    }

    initOpenWeatherUI() {
        this.owmCityId = 0;
        this.useOpenWeatherMap();
        this.checkPositionInPanel();
        this.currentWeather = new PopupMenu.PopupBaseMenuItem({
            reactive: false
        });
        if (!this.isForecastDisabled) {
            this.currentForecast = new PopupMenu.PopupBaseMenuItem({
                reactive: false
            });
            if (this.forecastDays != 0) {
                this.forecastExpander = new PopupMenu.PopupSubMenuMenuItem("");
            }
        }
        this.buttonMenu = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            style_class: 'myweather-menu-button-container'
        });
        this.selectCity = new PopupMenu.PopupSubMenuMenuItem("PopupSubMenuMenuItemCity");
        this.selectCity.actor.set_height(0);
        this.selectCity._triangle.set_height(0);

        this.rebuildCurrentWeatherUi();
        this.rebuildFutureWeatherUi();
        this.rebuildButtonMenu();
        this.rebuildSelectCityItem();

        this.menu.addMenuItem(this.currentWeather);
        if (!this.isForecastDisabled) {
            this.menu.addMenuItem(this.currentForecast);
            if (this.forecastDays != 0) {
                this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
                this.menu.addMenuItem(this.forecastExpander);
            }
        }
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addMenuItem(this.buttonMenu);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addMenuItem(this.selectCity);
        this.checkAlignment();
    }

    onStatusChanged(status) {
        this.idle = false;

        if (status == GnomeSession.PresenceStatus.IDLE) {
            this.idle = true;
        }
    }

    stop() {
        if (this.timeoutCurrent) {
            GLib.source_remove(this.timeoutCurrent);
            this.timeoutCurrent = null;
        }
        if (this.timeoutForecast) {
            GLib.source_remove(this.timeoutForecast);
            this.timeoutForecast = null;
        }
        if (this.timeoutFirstBoot) {
            GLib.source_remove(this.timeoutFirstBoot);
            this.timeoutFirstBoot = null;
        }

        if (this.timeoutMenuAlignent) {
            GLib.source_remove(this.timeoutMenuAlignent);
            this.timeoutMenuAlignent = null;
        }

        if (this.timeoutCheckConnectionState) {
            GLib.source_remove(this.timeoutCheckConnectionState);
            this.timeoutCheckConnectionState = null;
        }

        if (this.presenceConnection) {
            this.presence.disconnectSignal(this.presenceConnection);
            this.presenceConnection = undefined;
        }

        if (this.networkMonitorConnection) {
            this.networkMonitor.disconnect(this.networkMonitorConnection);
            this.networkMonitorConnection = undefined;
        }

        if (this.settingsC) {
            this.settings.disconnect(this.settingsC);
            this.settingsC = undefined;
        }

        if (this.settingsInterfaceC) {
            this.settingsInterface.disconnect(this.settingsInterfaceC);
            this.settingsInterfaceC = undefined;
        }

        if (this.globalThemeChangedId) {
            let context = St.ThemeContext.get_for_stage(global.stage);
            context.disconnect(this.globalThemeChangedId);
            this.globalThemeChangedId = undefined;
        }
    }

    useOpenWeatherMap() {
        this.initWeatherData = Weather.initWeatherData;
        this.reloadWeatherCache = Weather.reloadWeatherCache;
        this.refreshWeatherData = Weather.refreshWeatherData;
        this.populateCurrentUI = Weather.populateCurrentUI;

        if (!this.isForecastDisabled) {
            this.refreshForecastData = Weather.refreshForecastData;
            this.populateTodaysUI = Weather.populateTodaysUI;
            this.populateForecastUI = Weather.populateForecastUI;
            this.processTodaysData = Weather.processTodaysData;
            this.processForecastData = Weather.processForecastData;
        }
        this.loadJsonAsync = WeatherUtils.loadJsonAsync;
        this.weatherProvider = "OpenWeatherMap";

        if (this.appid.toString().trim() === '')
            Main.notify("OpenWeather", _("Openweathermap.org does not work without an api-key.\nEither set the switch to use the extensions default key in the preferences dialog to on or register at https://openweathermap.org/appid and paste your personal key into the preferences dialog."));
    }

    getWeatherProviderURL() {
        let url = "https://openweathermap.org";
        url += "/city/" + this.owmCityId;
        return url;
    }

    loadConfig() {
        this.settings = ExtensionUtils.getSettings(Me.metadata['settings-schema']);

        if (this.cities.length === 0)
            this.cities = "55.7522, 37.6156>Moscow >0";

        this.currentLocation = this.extractCoord(this.city);
        this.isForecastDisabled = this.disableForecast;
        this.forecastDays = this.daysForecast;
        this.currentAlignment = this.menuAlignment;
        this.providerTranslations = this.translationsProvider;

        // Get locale
        this.locale = GLib.get_language_names()[0];
        if (this.locale.indexOf('_') != -1)
            this.locale = this.locale.split("_")[0];
        else  // Fallback for 'C', 'C.UTF-8', and unknown locales.
            this.locale = 'ru';


        // Bind to settings changed signal
        this.settingsC = this.settings.connect("changed", () => {

            if (this.disableForecastChanged()) {
                let children = (this.isForecastDisabled) ? 4 : 7;
                if (this.forecastDays === 0) {
                    children = this.menu.box.get_children().length-1;
                }
                for (let i = 0; i < children; i++) {
                    this.menu.box.get_child_at_index(0).destroy();
                }
                this.isForecastDisabled = this.disableForecast;
                this.initOpenWeatherUI();
                this.clearWeatherCache();
                this.initWeatherData();
                return;
            }
            else if (this.locationChanged()) {
                if (this.cities.length === 0)
                    this.cities = "55.7522, 37.6156>Moscow >0";
                this.showRefreshing();
                if (this.selectCity._getOpenState())
                    this.selectCity.menu.toggle();
                this.currentLocation = this.extractCoord(this.city);
                this.rebuildSelectCityItem();
                this.clearWeatherCache();
                this.initWeatherData();
                return;
            }
            else {
                if (this.menuAlignmentChanged()) {
                    if (this.timeoutMenuAlignent)
                        GLib.source_remove(this.timeoutMenuAlignent);
                    // Use 1 second timeout to avoid crashes and spamming
                    // the logs while changing the slider position in prefs
                    this.timeoutMenuAlignent = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
                        this.checkAlignment();
                        this.currentAlignment = this.menuAlignment;
                        this.timeoutMenuAlignent = null;
                        return false; // run once then destroy
                    });
                    return;
                }
                if (this.forecastDays != this.daysForecast) {
                    let oldDays = this.forecastDays;
                    let newDays = this.daysForecast;
                    this.forecastDays = newDays;

                    if (oldDays >= 1 && newDays === 0) {
                        this.forecastExpander.destroy();
                        return;
                    } else if (oldDays === 0 && newDays >= 1) {
                        let children = this.menu.box.get_children().length-1;
                        for (let i = 0; i < children; i++) {
                            this.menu.box.get_child_at_index(0).destroy();
                        }
                        this.clearWeatherCache();
                        this.initOpenWeatherUI();
                        this.initWeatherData();
                        return;
                    } else {
                        this.forecastJsonCache = undefined;
                        this.rebuildFutureWeatherUi();
                        this.reloadWeatherCache();
                        return;
                    }
                }
                if (this.providerTranslations != this.translationsProvider) {
                    this.providerTranslations = this.translationsProvider;
                    if (this.providerTranslations) {
                        this.showRefreshing();
                        this.clearWeatherCache();
                        this.initWeatherData();
                    } else {
                        this.reloadWeatherCache();
                    }
                    return;
                }
                this.checkAlignment();
                this.checkPositionInPanel();
                this.rebuildCurrentWeatherUi();
                this.rebuildFutureWeatherUi();
                this.rebuildButtonMenu();
                this.reloadWeatherCache();
            }
        });
    }

    loadConfigInterface() {
        this.settingsInterface = ExtensionUtils.getSettings('org.gnome.desktop.interface');
        this.settingsInterfaceC = this.settingsInterface.connect("changed", () => {
            this.rebuildCurrentWeatherUi();
            this.rebuildFutureWeatherUi();
            if (this.locationChanged()) {
                this.rebuildSelectCityItem();
                this.clearWeatherCache();
                this.initWeatherData();
            }
            else {
                this.reloadWeatherCache();
            }
        });
    }

    clearWeatherCache() {
        this.currentWeatherCache = undefined;
        this.todaysWeatherCache = undefined;
        this.forecastWeatherCache = undefined;
        this.forecastJsonCache = undefined;
    }

    onNetworkStateChanged() {
        this.checkConnectionState();
    }

    checkConnectionState() {
        this.checkConnectionStateRetries = 3;
        this.oldConnected = this.connected;
        this.connected = false;

        this.checkConnectionStateWithRetries(1250);
    }

    checkConnectionStateRetry() {
        if (this.checkConnectionStateRetries > 0) {
            let timeout;
            if (this.checkConnectionStateRetries == 3)
                timeout = 10000;
            else if (this.checkConnectionStateRetries == 2)
                timeout = 30000;
            else if (this.checkConnectionStateRetries == 1)
                timeout = 60000;

            this.checkConnectionStateRetries -= 1;
            this.checkConnectionStateWithRetries(timeout);
        }
    }

    checkConnectionStateWithRetries(interval) {
        if (this.timeoutCheckConnectionState) {
            GLib.source_remove(this.timeoutCheckConnectionState);
            this.timeoutCheckConnectionState = null;
        }

        this.timeoutCheckConnectionState = GLib.timeout_add(GLib.PRIORITY_DEFAULT, interval, () => {
            // Nullify the variable holding the timeout-id, otherwise we can get errors, if we try to delete
            // it manually, the timeout will be destroyed automatically if we return false.
            // We just fetch it for the rare case, where the connection changes or the extension will be stopped during
            // the timeout.
            this.timeoutCheckConnectionState = null;
            let url = this.getWeatherProviderURL();
            let address = Gio.NetworkAddress.parse_uri(url, 80);
            let cancellable = Gio.Cancellable.new();
            try {
                this.networkMonitor.can_reach_async(address, cancellable, this.asyncReadyCallback.bind(this));
            } catch (err) {
                let title = _("Can not connect to %s").format(url);
                log(title + '\n' + err.message);
                this.checkConnectionStateRetry();
            }
            return false;
        });
    }

    asyncReadyCallback(nm, res) {
        try {
            this.connected = this.networkMonitor.can_reach_finish(res);
        } catch (err) {
            let title = _("Can not connect to %s").format(this.getWeatherProviderURL());
            log(title + '\n' + err.message);
            this.checkConnectionStateRetry();
            return;
        }
        if (!this.oldConnected && this.connected) {
            let now = new Date();
            if (
                timeCacheCurrentWeather
                && (Math.floor(new Date(now - timeCacheCurrentWeather).getTime() / 1000) > this.refreshIntervalCurrent)
            ) {
                this.currentWeatherCache = undefined;
            }
            if (
                !this.isForecastDisabled
                && timeCacheForecastWeather
                && (Math.floor(new Date(now - timeCacheForecastWeather).getTime() / 1000) > this.refreshIntervalForecast)
            ) {
                this.forecastWeatherCache = undefined;
                this.todaysWeatherCache = undefined;
            }
            this.forecastJsonCache = undefined;
            this.initWeatherData();
        }
    }

    disableForecastChanged() {
        if (this.isForecastDisabled != this.disableForecast) {
            return true;
        }
        return false;
    }

    locationChanged() {
        let location = this.extractCoord(this.city);
        if (this.currentLocation != location) {
            return true;
        }
        return false;
    }

    menuAlignmentChanged() {
        if (this.currentAlignment != this.menuAlignment) {
            return true;
        }
        return false;
    }

    get clockFormat() {
        if (!this.settingsInterface) {
            this.loadConfigInterface();
        }
        return this.settingsInterface.get_string("clock-format");
    }

    get _weatherProvider() {
        // Simplify until more providers are added
        return 0;
        // if (!this._settings)
        //     this.loadConfig();
        // let provider = this.extractProvider(this._city);
        // if (provider == WeatherProvider.DEFAULT)
        //     provider = this._settings.get_enum('weather-provider');
        // return provider;
    }

    get units() {
        if (!this.settings) {
            this.loadConfig();
        }
        return this.settings.get_enum('unit');
    }

    get windSpeedUnits() {
        if (!this.settings) {
            this.loadConfig();
        }
        return this.settings.get_enum('wind-speed-unit');
    }

    get windDirection() {
        if (!this.settings) {
            this.loadConfig();
        }
        return this.settings.get_boolean('wind-direction');
    }

    get pressureUnits() {
        if (!this.settings) {
            this.loadConfig();
        }
        return this.settings.get_enum('pressure-unit');
    }

    get cities() {
        if (!this.settings) {
            this.loadConfig();
        }
        return this.settings.get_string('city');
    }

    set cities(v) {
        if (!this.settings) {
            this.loadConfig();
        }
        return this.settings.set_string('city', v);
    }

    get actualCity() {
        if (!this.settings) {
            this.loadConfig();
        }
        let acCity = this.settings.get_int('actual-city');
        let cities = this.cities.split(" && ");

        if (typeof cities != "object") {
            cities = [cities];
        }

        let  length = cities.length - 1;

        if (acCity < 0) {
            acCity = 0;
        }

        if (length < 0) {
            length = 0;
        }

        if (acCity > length) {
            acCity = length;
        }

        return acCity;
    }

    set actualCity(acCity) {
        if (!this.settings) {
            this.loadConfig();
        }
        let cities = this.cities.split(" && ");

        if (typeof cities != "object") {
            cities = [cities];
        }

        let  length = cities.length - 1;

        if (acCity < 0) {
            acCity = 0;
        }

        if (length < 0) {
            length = 0;
        }

        if (acCity > length) {
            acCity = length;
        }


        this.settings.set_int('actual-city', acCity);
    }

    get city() {
        let cities = this.cities.split(" && ");
        if (cities && typeof cities == "string") {
            cities = [cities];
        }

        if (!cities[0]) {
            return "";
        }

        cities = cities[this.actualCity];
        return cities;
    }

    get translateCondition() {
        if (!this.settings) {
            this.loadConfig();
        }
        return this.settings.get_boolean('translate-condition');
    }

    get translationsProvider() {
        if (!this.settings) {
            this.loadConfig();
        }
        return this.settings.get_boolean('owm-api-translate');
    }

    get getUseSysIcons() {
        if (!this.settings) {
            this.loadConfig();
        }
        return this.settings.get_boolean('use-system-icons') ? 1 : 0;
    }

    get startupDelay() {
        if (!this.settings) {
            this.loadConfig();
        }
        return this.settings.get_int('delay-ext-init');
    }

    get textInPanel() {
        if (!this.settings) {
            this.loadConfig();
        }
        return this.settings.get_boolean('show-text-in-panel');
    }

    get positionInPanel() {
        if (!this.settings) {
            this.loadConfig();
        }
        return this.settings.get_enum('position-in-panel');
    }

    get positionIndex() {
        if (!this.settings) {
            this.loadConfig();
        }
        return this.settings.get_int('position-index');
    }

    get menuAlignment() {
        if (!this.settings) {
            this.loadConfig();
        }
        return this.settings.get_double('menu-alignment');
    }

    get commentInPanel() {
        if (!this.settings) {
            this.loadConfig();
        }
        return this.settings.get_boolean('show-comment-in-panel');
    }

    get disableForecast() {
        if (!this.settings) {
            this.loadConfig();
        }
        return this.settings.get_boolean('disable-forecast');
    }

    get commentInForecast() {
        if (!this.settings) {
            this.loadConfig();
        }
        return this.settings.get_boolean('show-comment-in-forecast');
    }

    get refreshIntervalCurrent() {
        if (!this.settings) {
            this.loadConfig();
        }
        let v = this.settings.get_int('refresh-interval-current');
        return ((v >= 600) ? v : 600);
    }

    get refreshIntervalForecast() {
        if (!this.settings) {
            this.loadConfig();
        }
        let v = this.settings.get_int('refresh-interval-forecast');
        return ((v >= 3600) ? v : 3600);
    }

    get locLenCurrent() {
        if (!this.settings) {
            this.loadConfig();
        }
        let v = this.settings.get_int('location-text-length');
        return ((v > 0) ? v : 0);
    }

    get centerForecast() {
        if (!this.settings) {
            this.loadConfig();
        }
        return this.settings.get_boolean('center-forecast');
    }

    get daysForecast() {
        if (!this.settings) {
            this.loadConfig();
        }
        return this.settings.get_int('days-forecast');
    }

    get decimalPlaces() {
        if (!this.settings) {
            this.loadConfig();
        }
        return this.settings.get_int('decimal-places');
    }

    get appid() {
        if (!this.settings)
            this.loadConfig();
        let key = '';
        let useDefaultKey = this.settings.get_boolean('use-default-owm-key');

        if (useDefaultKey) {
            key = '';
        } else {
            key = this.settings.get_string('appid');
        }
        return (key.length == 32) ? key : '';
    }

    createButton(iconName, accessibleName) {
        let button;

        button = new St.Button({
            reactive: true,
            can_focus: true,
            track_hover: true,
            accessible_name: accessibleName,
            style_class: 'message-list-clear-button button myweather-button-action'
        });

        button.child = new St.Icon({
            icon_name: iconName
        });

        return button;
    }

    rebuildButtonMenu() {
        this.buttonMenu.actor.destroy_all_children();

        this.buttonBox1 = new St.BoxLayout({
            style_class: 'myweather-button-box'
        });
        this.buttonBox2 = new St.BoxLayout({
            style_class: 'myweather-button-box'
        });

        this.locationButton = this.createButton('find-location-symbolic', _("Locations"));
        this.reloadButton = this.createButton('view-refresh-symbolic', _("Reload Weather Information"));
        this.prefsButton = this.createButton('preferences-system-symbolic', _("Weather Settings"));

        this.buttonBox1.add_actor(this.locationButton);
        this.buttonBox1.add_actor(this.reloadButton);
        this.buttonBox2.add_actor(this.prefsButton);

        this.locationButton.connect('clicked', () => {
            this.selectCity._setOpenState(!this.selectCity._getOpenState());
        });
        this.reloadButton.connect('clicked', () => {
            if (this.lastRefresh) {
                let twoMinsAgo = Date.now() - 120000;
                if (this.lastRefresh > twoMinsAgo) {
                    Main.notify("OpenWeather", _("Manual refreshes less than 2 minutes apart are ignored!"));
                    return;
                }
            }
            this.showRefreshing();
            this.initWeatherData(true);
        });
        this.prefsButton.connect('clicked', this.onPreferencesActivate.bind(this));

        this.buttonMenu.actor.add_actor(this.buttonBox1);
        this.buttonMenu.actor.add_actor(this.buttonBox2);
    }

    rebuildSelectCityItem() {
        this.selectCity.menu.removeAll();
        let item = null;

        let cities = this.cities;
        cities = cities.split(" && ");
        if (cities && typeof cities == "string") {
            cities = [cities];
        }

        if (!cities[0]) {
            return;
        }

        for (let i = 0; cities.length > i; i++) {
            item = new PopupMenu.PopupMenuItem(this.extractLocation(cities[i]));
            item.location = i;
            if (i == this.actualCity) {
                item.setOrnament(PopupMenu.Ornament.DOT);
            }

            this.selectCity.menu.addMenuItem(item);
            // override the items default onActivate-handler, to keep the ui open while choosing the location
            item.activate = this.onActivate;
        }

        if (cities.length == 1) {
            this.selectCity.actor.hide();
        } else {
            this.selectCity.actor.show();
        }
    }

    onActivate() {
        openWeatherMenu.actualCity = this.location;
    }

    /**
     *
     * @returns {*|string}
     */
    extractLocation() {
        if (!arguments[0]) {
            return "";
        }

        if (arguments[0].search(">") == -1) {
            return _("Invalid city");
        }

        return arguments[0].split(">")[1];
    }

    /**
     *
     * @returns {number}
     */
    extractCoord() {
        let coords = 0;

        if (arguments[0] && (arguments[0].search(">") != -1)) {
            coords = arguments[0].split(">")[0].replace(' ', '');
        }

        if ((coords.search(",") == -1) || isNaN(coords.split(",")[0]) || isNaN(coords.split(",")[1])) {
            Main.notify("OpenWeather", _("Invalid location! Please try to recreate it."));
            return 0;
        }

        return coords;
    }

    /**
     * if we will need another provider for weather
     * @returns {number}
     */
    extractProvider() {
        if (!arguments[0])
            return -1;
        if (arguments[0].split(">")[2] === undefined)
            return -1;
        if (isNaN(parseInt(arguments[0].split(">")[2])))
            return -1;
        return parseInt(arguments[0].split(">")[2]);
    }

    /**
     *
     * @returns {number}
     */
    onPreferencesActivate() {
        this.menu.close();
        ExtensionUtils.openPrefs();
        return 0;
    }


    recalcLayout() {
        if (!this.menu.isOpen) {
            return;
        }

        if (!this.isForecastDisabled && this.currentForecast !== undefined)
            this.currentForecast.set_width(this.currentWeather.get_width());

        if (!this.isForecastDisabled && this.forecastDays != 0 && this.forecastExpander !== undefined) {
            this.forecastScrollBox.set_width(this.forecastExpanderBox.get_width() - this.daysBox.get_width());
            this.forecastScrollBox.show();
            this.forecastScrollBox.hscroll.show();

            if (this.settings.get_boolean('expand-forecast')) {
                this.forecastExpander.setSubmenuShown(true);
            } else {
                this.forecastExpander.setSubmenuShown(false);
            }
        }
        this.buttonBox1.set_width(this.currentWeather.get_width() - this.buttonBox2.get_width());
    }




    getWeatherIcon(iconname) {
        // Built-in icons option and fallback for missing icons on some distros
        if (this.getUseSysIcons && Gtk.IconTheme.get_default().has_icon(iconname)) {
            return Gio.icon_new_for_string(iconname);
        } // No icon available or user prefers built in icons
        else {
            return Gio.icon_new_for_string(Me.path + "/media/status/" + iconname + ".svg");
        }
    }

    checkAlignment() {
        let menuAlignment = 1.0 - (this.menuAlignment / 100);
        if (Clutter.get_default_text_direction() == Clutter.TextDirection.RTL)
            menuAlignment = 1.0 - menuAlignment;
        this.menu._arrowAlignment=menuAlignment;
    }

    checkPositionInPanel() {
        if (
            this.oldPositionInPanel == undefined
            || this.oldPositionInPanel != this.positionInPanel
            || this.firstRun || this.oldPositionIndex != this.positionIndex
        ) {
            this.get_parent().remove_actor(this);

            let children = null;
            switch (this.positionInPanel) {
                case WeatherUtils.WeatherPosition.LEFT:
                    children = Main.panel._leftBox.get_children();
                    Main.panel._leftBox.insert_child_at_index(this, this.positionIndex);
                    break;
                case WeatherUtils.WeatherPosition.CENTER:
                    children = Main.panel._centerBox.get_children();
                    Main.panel._centerBox.insert_child_at_index(this, this.positionIndex);
                    break;
                case WeatherUtils.WeatherPosition.RIGHT:
                    children = Main.panel._rightBox.get_children();
                    Main.panel._rightBox.insert_child_at_index(this, this.positionIndex);
                    break;
            }
            this.oldPositionInPanel = this.positionInPanel;
            this.oldPositionIndex = this.positionIndex;
            this.firstRun = 1;
        }

    }

    reloadWeatherCurrent(interval) {
        if (this.timeoutCurrent) {
            GLib.source_remove(this.timeoutCurrent);
            this.timeoutCurrent = null;
        }
        timeCacheCurrentWeather = new Date();
        this.timeoutCurrent = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, interval, () => {
            this.refreshWeatherData();
            return true;
        });
    }

    reloadWeatherForecast(interval) {
        if (this.timeoutForecast) {
            GLib.source_remove(this.timeoutForecast);
            this.timeoutForecast = null;
        }
        if (this.isForecastDisabled)
            return;

        timeCacheForecastWeather = new Date();
        this.timeoutForecast = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT_IDLE, interval, () => {
            this.refreshForecastData();
            return true;
        });
    }

    showRefreshing() {
        this.currentWeatherSummary.text = _('Loading ...');
        this.currentWeatherIcon.icon_name = 'view-refresh-symbolic';
    }

    rebuildCurrentWeatherUi() {
        this.currentWeather.actor.destroy_all_children();
        if (!this.isForecastDisabled)
            this.currentForecast.actor.destroy_all_children();

        this.weatherInfo.text = ('...');
        this.weatherIcon.icon_name = 'view-refresh-symbolic';

        // This will hold the icon for the current weather
        this.currentWeatherIcon = new St.Icon({
            icon_size: 96,
            icon_name: 'view-refresh-symbolic',
            style_class: 'system-menu-action myweather-current-icon'
        });

        this.sunriseIcon = new St.Icon({
            icon_size: 15,
            style_class: 'myweather-sunrise-icon'
        });
        this.sunsetIcon = new St.Icon({
            icon_size: 15,
            style_class: 'myweather-sunset-icon '
        });
        this.sunriseIcon.set_gicon(this.getWeatherIcon('daytime-sunrise-symbolic'));
        this.sunsetIcon.set_gicon(this.getWeatherIcon('daytime-sunset-symbolic'));

        this.buildIcon = new St.Icon({
            icon_size: 15,
            icon_name: 'view-refresh-symbolic',
            style_class: 'myweather-build-icon'
        });

        // The summary of the current weather
        this.currentWeatherSummary = new St.Label({
            text: _('Loading ...'),
            style_class: 'myweather-current-summary'
        });
        this.currentWeatherLocation = new St.Label({
            text: _('Please wait')
        });

        let bb = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'system-menu-action myweather-current-summarybox'
        });
        bb.add_actor(this.currentWeatherLocation);
        bb.add_actor(this.currentWeatherSummary);

        this.currentWeatherSunrise = new St.Label({
            text: '-'
        });
        this.currentWeatherSunset = new St.Label({
            text: '-'
        });
        this.currentWeatherBuild = new St.Label({
            text: '-'
        });

        let ab = new St.BoxLayout({
            x_expand: true,
            style_class: 'myweather-current-infobox'
        });

        ab.add_actor(this.sunriseIcon);
        ab.add_actor(this.currentWeatherSunrise);
        ab.add_actor(this.sunsetIcon);
        ab.add_actor(this.currentWeatherSunset);
        ab.add_actor(this.buildIcon);
        ab.add_actor(this.currentWeatherBuild);
        bb.add_actor(ab);

        // Other labels
        this.currentWeatherFeelsLike = new St.Label({
            text: '...'
        });
        this.currentWeatherHumidity = new St.Label({
            text: '...'
        });
        this.currentWeatherPressure = new St.Label({
            text: '...'
        });
        this.currentWeatherWind = new St.Label({
            text: '...'
        });
        this.currentWeatherWindGusts = new St.Label({
            text: '...'
        });

        let rb = new St.BoxLayout({
            x_expand: true,
            style_class: 'myweather-current-databox'
        });
        let rbCaptions = new St.BoxLayout({
            x_expand: true,
            vertical: true,
            style_class: 'popup-menu-item popup-status-menu-item myweather-current-databox-captions'
        });
        let rbValues = new St.BoxLayout({
            x_expand: true,
            vertical: true,
            style_class: 'system-menu-action myweather-current-databox-values'
        });
        rb.add_actor(rbCaptions);
        rb.add_actor(rbValues);

        rbCaptions.add_actor(new St.Label({
            text: _('Feels Like:')
        }));
        rbValues.add_actor(this.currentWeatherFeelsLike);
        rbCaptions.add_actor(new St.Label({
            text: _('Humidity:')
        }));
        rbValues.add_actor(this.currentWeatherHumidity);
        rbCaptions.add_actor(new St.Label({
            text: _('Pressure:')
        }));
        rbValues.add_actor(this.currentWeatherPressure);
        rbCaptions.add_actor(new St.Label({
            text: _('Wind:')
        }));
        rbValues.add_actor(this.currentWeatherWind);
        rbCaptions.add_actor(new St.Label({
            text: _('Gusts:')
        }));
        rbValues.add_actor(this.currentWeatherWindGusts);

        let xb = new St.BoxLayout({
            x_expand: true
        });
        xb.add_actor(bb);
        xb.add_actor(rb);

        let box = new St.BoxLayout({
            x_expand: true,
            style_class: 'myweather-current-iconbox'
        });
        box.add_actor(this.currentWeatherIcon);
        box.add_actor(xb);
        this.currentWeather.actor.add_child(box);

        // Today's forecast if not disabled by user
        if (this.isForecastDisabled) {
            return;
        }

        this.todaysForecast = [];
        this.todaysBox = new St.BoxLayout({
            x_expand: true,
            x_align: this.centerForecast ? St.Align.END : St.Align.START,
            style_class: 'myweather-today-box'
        });

        for (let i = 0; i < 4; i++) {
            let todaysForecast = {};

            todaysForecast.Time = new St.Label({
                style_class: 'myweather-forcast-time'
            });
            todaysForecast.Icon = new St.Icon({
                icon_size: 24,
                icon_name: 'view-refresh-symbolic',
                style_class: 'myweather-forecast-icon'
            });
            todaysForecast.Temperature = new St.Label({
                style_class: 'myweather-forecast-temperature'
            });
            todaysForecast.Summary = new St.Label({
                style_class: 'myweather-forecast-summary'
            });
            todaysForecast.Summary.clutter_text.line_wrap = true;

            let fb = new St.BoxLayout({
                vertical: true,
                x_expand: true,
                style_class: 'myweather-today-databox'
            });
            let fib = new St.BoxLayout({
                x_expand: true,
                x_align: Clutter.ActorAlign.CENTER,
                style_class: 'myweather-forecast-iconbox'
            });

            fib.add_actor(todaysForecast.Icon);
            fib.add_actor(todaysForecast.Temperature);

            fb.add_actor(todaysForecast.Time);
            fb.add_actor(fib);
            if (this.commentInForecast) {
                fb.add_actor(todaysForecast.Summary);
            }

            this.todaysForecast[i] = todaysForecast;
            this.todaysBox.add_actor(fb);
        }
        this.currentForecast.actor.add_child(this.todaysBox);
    }

    scrollForecastBy(delta) {
        if (this.forecastScrollBox === undefined) {
            return;
        }

        this.forecastScrollBox.hscroll.adjustment.value += delta;
    }

    rebuildFutureWeatherUi(cnt) {
        if (this.isForecastDisabled || this.forecastDays === 0) {
            return;
        }

        this.forecastExpander.menu.box.destroy_all_children();

        this.forecast = [];
        this.forecastExpanderBox = new St.BoxLayout({
            x_expand: true,
            opacity: 150,
            style_class: 'myweather-forecast-expander'
        });
        this.forecastExpander.menu.box.add(this.forecastExpanderBox);

        this.daysBox = new St.BoxLayout({
            vertical: true,
            y_expand: true,
            style_class: 'myweather-forecast-box'
        });
        this.forecastBox = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            style_class: 'myweather-forecast-box'
        });
        this.forecastScrollBox = new St.ScrollView({
            x_expand: true,
            style_class: 'myweather-forecasts'
        });
        let pan = new Clutter.PanAction({
            interpolate: true
        });
        pan.connect('pan', (action) => {

            let[dist, dx, dy] = action.get_motion_delta(0);

            this.scrollForecastBy(-1 * (dx / this.forecastScrollBox.width) * this.forecastScrollBox.hscroll.adjustment.page_size);
            return false;
        });
        this.forecastScrollBox.add_action(pan);
        this.forecastScrollBox.connect('scroll-event', this.onScroll.bind(this));
        this.forecastScrollBox.hscroll.connect('scroll-event', this.onScroll.bind(this));
        this.forecastScrollBox.hscroll.margin_right = 25;
        this.forecastScrollBox.hscroll.margin_left = 25;
        this.forecastScrollBox.hscroll.hide();
        this.forecastScrollBox.vscrollbar_policy = Gtk.PolicyType.NEVER;
        this.forecastScrollBox.hscrollbar_policy = Gtk.PolicyType.AUTOMATIC;
        this.forecastScrollBox.enable_mouse_scrolling = true;
        this.forecastScrollBox.hide();

        if (cnt === undefined) {
            cnt = this.daysForecast;
        }


        if (cnt === 1) {
            this.forecastExpander.label.set_text( _("Tomorrow's Forecast") );
        } else {
            this.forecastExpander.label.set_text( _("%s Day Forecast").format(cnt) );
        }

        for (let i = 0; i < cnt; i++) {
            let forecastWeather = {};

            forecastWeather.Day = new St.Label({
                style_class: 'myweather-forecast-day'
            });
            this.daysBox.add_actor(forecastWeather.Day);

            let forecastWeatherBox = new St.BoxLayout({
                x_expand: true,
                x_align: Clutter.ActorAlign.CENTER
            });

            for (let j = 0; j < 8; j++) {
                forecastWeather[j] = {};

                forecastWeather[j].Time = new St.Label({
                    style_class: 'myweather-forcast-time'
                });
                forecastWeather[j].Icon = new St.Icon({
                    icon_size: 24,
                    style_class: 'myweather-forecast-icon'
                });
                forecastWeather[j].Temperature = new St.Label({
                    style_class: 'myweather-forecast-temperature'
                });
                forecastWeather[j].Summary = new St.Label({
                    style_class: 'myweather-forecast-summary'
                });
                forecastWeather[j].Summary.clutter_text.line_wrap = true;

                let by = new St.BoxLayout({
                    vertical: true,
                    x_expand: true,
                    style_class: 'myweather-forecast-databox'
                });
                let bib = new St.BoxLayout({
                    x_expand: true,
                    x_align: Clutter.ActorAlign.CENTER,
                    style_class: 'myweather-forecast-iconbox'
                });

                bib.add_actor(forecastWeather[j].Icon);
                bib.add_actor(forecastWeather[j].Temperature);

                by.add_actor(forecastWeather[j].Time);
                by.add_actor(bib);

                if (this.commentInForecast) {
                    by.add_actor(forecastWeather[j].Summary);
                }

                forecastWeatherBox.add_actor(by);
            }
            this.forecast[i] = forecastWeather;
            this.forecastBox.add_actor(forecastWeatherBox);
        }
        this.forecastScrollBox.add_actor(this.forecastBox);
        this.forecastExpanderBox.add_actor(this.daysBox);
        this.forecastExpanderBox.add_actor(this.forecastScrollBox);
    }

    onScroll(actor, event) {
        if (this.isForecastDisabled) {
            return;
        }

        let dx = 0;
        let dy = 0;
        switch (event.get_scroll_direction()) {
            case Clutter.ScrollDirection.UP:
            case Clutter.ScrollDirection.RIGHT:
                dy = -1;
                break;
            case Clutter.ScrollDirection.DOWN:
            case Clutter.ScrollDirection.LEFT:
                dy = 1;
                break;
            default:
                return true;
        }

        this.scrollForecastBy(dy * this.forecastScrollBox.hscroll.adjustment.stepIncrement);
        return false;
    }

});


let openWeatherMenu;

function init() {
    ExtensionUtils.initTranslations(Me.metadata['gettext-domain']);
}

function enable() {
    openWeatherMenu = new WeatherExt();
    Main.panel.addToStatusArea('openWeatherMenu', openWeatherMenu);
}

function disable() {
    openWeatherMenu.stop();
    openWeatherMenu.destroy();
    openWeatherMenu = null;
}


