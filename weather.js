
const { Soup, GLib } = imports.gi;
const ByteArray = imports.byteArray;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;

const WeatherUtils = Me.imports.utils;

/**
 *
 * @param refresh
 * @returns {Promise<void>}
 */
async function initWeatherData(refresh) {
    if (refresh) {
        this.lastRefresh = Date.now();
    }
    try {
        await this.refreshWeatherData()
            .then(async () => {
                try {
                    if (!this.isForecastDisabled) {
                        await this.refreshForecastData()
                            .then(this.recalcLayout());
                    } else {
                        this.recalcLayout();
                    }
                }
                catch (e) {
                    logError(e);
                }
            });
    }
    catch (e) {
        logError(e);
    }
}

/**
 *
 * @returns {Promise<void>}
 */
async function reloadWeatherCache() {
    try {
        await this.populateCurrentUI()
            .then(async () => {
                try {
                    if (!this.isForecastDisabled) {
                        if (this.forecastJsonCache === undefined) {
                            // cache was cleared, so we need to force a refresh
                            await this.refreshForecastData()
                                .then(this.recalcLayout());
                        } else {
                            // otherwise we just reload the current cache
                            await this.populateTodaysUI()
                                .then(async () => {
                                    if (this.forecastDays >= 1) {
                                        await this.populateForecastUI();
                                    }
                                }).then(this.recalcLayout());
                        }
                    }
                }
                catch (e) {
                    logError(e);
                }
            });
    }
    catch (e) {
        logError(e);
    }
}

/**
 *
 * @returns {Promise<void>}
 */
async function refreshWeatherData() {
    let json = undefined;
    let location = this.extractCoord(this.city);
    let params = {
        lat: location.split(",")[0],
        lon: location.split(",")[1],
        units: 'metric'
    };
    if (this.providerTranslations) {
        params.lang = this.locale;
    }
    if (this.appid) {
        params.appid = this.appid;
    }
    const owmCurrentUrl = 'https://api.openweathermap.org/data/2.5/weather';
    try {
        json = await WeatherUtils.loadJsonAsync(owmCurrentUrl, params)
            .then(async (json) => {
                try {
                    this.currentWeatherCache = json;
                    await this.populateCurrentUI();
                }
                catch (e) {
                    logError(e);
                }
            });
    }
    catch (e) {
        // Something went wrong, reload after 10 minutes
        // as per openweathermap.org recommendation.
        this.reloadWeatherCurrent(600);
        logError(e);
    }
    this.reloadWeatherCurrent(this.refreshIntervalCurrent);
}

/**
 *
 * @returns {Promise<void>}
 */
async function refreshForecastData() {
    // Did the user disable the forecast?
    if (this.isForecastDisabled) {
        return;
    }
    let json = undefined;
    let sortedList = undefined;
    let todayList = undefined;
    let location = this.extractCoord(this.city);
    let params = {
        lat: location.split(",")[0],
        lon: location.split(",")[1],
        units: 'metric'
    };
    if (this.providerTranslations) {
        params.lang = this.locale;
    }
    if (this.appid) {
        params.appid = this.appid;
    }
    const owmForecastUrl = 'https://api.openweathermap.org/data/2.5/forecast';
    try {
        json = await WeatherUtils.loadJsonAsync(owmForecastUrl, params)
            .then(async (json) => {
                processing: try {

                    if (this.forecastJsonCache) {
                        let freshData = JSON.stringify(json.list[0]);
                        let cacheData = JSON.stringify(this.forecastJsonCache.list[0]);
                        if (freshData === cacheData) {
                            // No need to process if data unchanged
                            break processing;
                        }
                    }
                    this.forecastJsonCache = json;
                    this.todaysWeatherCache = undefined;
                    this.forecastWeatherCache = undefined;
                    this.owmCityId = json.city.id;
                    // Today's forecast
                    todayList = await this.processTodaysData(json)
                        .then(async (todayList) => {
                            try {
                                this.todaysWeatherCache = todayList;
                                await this.populateTodaysUI();
                            }
                            catch (e) {
                                logError(e);
                            }
                        });
                    // 5 day / 3 hour forecast
                    if (this.forecastDays === 0) {
                        // Stop if only today's forecast is enabled
                        break processing;
                    }
                    sortedList = await this.processForecastData(json)
                        .then(async (sortedList) => {
                            try {
                                this.forecastWeatherCache = sortedList;
                                await this.populateForecastUI();
                            }
                            catch (e) {
                                logError(e);
                            }
                        });
                }
                catch (e) {
                    logError(e);
                }
            });
    }
    catch (e) {
        /// Something went wrong, reload after 10 minutes
        // as per openweathermap.org recommendation.
        this.reloadWeatherForecast(600);
        logError(e);
    }
    this.reloadWeatherForecast(this.refreshIntervalCurrent);
}

/**
 *
 * @returns {Promise<unknown>}
 */
function populateCurrentUI() {
    return new Promise((resolve, reject) => {
        try {
            let json = this.currentWeatherCache;
            this.owmCityId = json.id;

            let comment = json.weather[0].description;
            if (this.translateCondition && !this.providerTranslations)
                comment = WeatherUtils.getWeatherCondition(json.weather[0].id);

            let location              = this.extractLocation(this.city);
            let temperature           = WeatherUtils.formatTemperature(json.main.temp, this.units, this.decimalPlaces);
            let sunrise         = new Date(json.sys.sunrise * 1000);
            let sunset          = new Date(json.sys.sunset * 1000);
            let now             = new Date();
            let lastBuild      = '-';

            if (this.clockFormat === "24h") {
                sunrise     = sunrise.toLocaleTimeString([this.locale], { hour12: false });
                sunset      = sunset.toLocaleTimeString([this.locale], { hour12: false });
                lastBuild   = now.toLocaleTimeString([this.locale], { hour12: false });
            } else {
                sunrise     = sunrise.toLocaleTimeString([this.locale], { hour: 'numeric', minute: 'numeric' });
                sunset      = sunset.toLocaleTimeString([this.locale], { hour: 'numeric', minute: 'numeric' });
                lastBuild   = now.toLocaleTimeString([this.locale], { hour: 'numeric', minute: 'numeric' });
            }

            let iconname = WeatherUtils.IconMap[json.weather[0].icon];
            this.currentWeatherIcon.set_gicon(this.getWeatherIcon(iconname));
            this.weatherIcon.set_gicon(this.getWeatherIcon(iconname));

            let weatherInfoC = "";
            let weatherInfoT = "";

            if (this.commentInPanel) {
                weatherInfoC = comment;
            }

            if (this.textInPanel) {
                weatherInfoT = temperature;
            }


            this.weatherInfo.text = weatherInfoC + ((weatherInfoC && weatherInfoT) ? _(", ") : "") + weatherInfoT;

            this.currentWeatherSummary.text = comment + _(", ") + temperature;

            if (this.locLenCurrent !== 0 && location.length > this.locLenCurrent) {
                this.currentWeatherLocation.text = location.substring(0, (this.locLenCurrent - 3)) + "...";
            } else {
                this.currentWeatherLocation.text = location;

            }

            this.currentWeatherFeelsLike.text   = WeatherUtils.formatTemperature(
                                                                                    json.main.feels_like,
                                                                                    this.units,
                                                                                    this.decimalPlaces
            );

            this.currentWeatherHumidity.text    = json.main.humidity + ' %';
            this.currentWeatherPressure.text    = WeatherUtils.formatPressure(
                                                                                json.main.pressure,
                                                                                this.pressureUnits,
                                                                                this.decimalPlaces
            );
            this.currentWeatherSunrise.text     = sunrise;
            this.currentWeatherSunset.text      = sunset;
            this.currentWeatherBuild.text       = lastBuild;

            if (json.wind !== undefined && json.wind.deg !== undefined) {
                this.currentWeatherWind.text = WeatherUtils.formatWind(json.wind.speed,
                    WeatherUtils.getWindDirection(json.wind.deg, this.windDirection),
                    this.decimalPlaces,
                    this.windSpeedUnits
                );

                if (json.wind.gust !== undefined) {
                    this.currentWeatherWindGusts.text = WeatherUtils.formatWind(json.wind.gust);
                }

            } else {
                this.currentWeatherWind.text = _("?");
            }
            resolve(0);
        }
        catch (e) {
            reject(e);
        }
    });
}

/**
 *
 * @returns {Promise<unknown>}
 */
function populateTodaysUI() {
    return new Promise((resolve, reject) => {
        try {
            // Populate today's forecast UI
            let forecastToday = this.todaysWeatherCache;

            for (var i = 0; i < 4; i++) {
                let forecastTodayUi = this.todaysForecast[i];
                let forecastDataToday = forecastToday[i];

                let forecastTime     = new Date(forecastDataToday.dt * 1000);
                let forecastTemp           = WeatherUtils.formatTemperature(forecastDataToday.main.temp, this.units, this.decimalPlaces);
                let iconTime        = forecastTime.toLocaleTimeString([this.locale], { hour12: false });
                let iconname               = WeatherUtils.IconMap[forecastDataToday.weather[0].icon];

                let comment = forecastDataToday.weather[0].description;
                if (this.translateCondition && !this.providerTranslations) {
                    comment = WeatherUtils.getWeatherCondition(forecastDataToday.weather[0].id);
                }

                if (this.clockFormat === "24h") {
                    forecastTime = forecastTime.toLocaleTimeString([this.locale], { hour12: false });
                    forecastTime = forecastTime.substring(0, forecastTime.length -3);
                } else {
                    forecastTime = forecastTime.toLocaleTimeString([this.locale], { hour: 'numeric' });
                }
                forecastTodayUi.Time.text = forecastTime;
                forecastTodayUi.Icon.set_gicon(this.getWeatherIcon(iconname));
                forecastTodayUi.Temperature.text = forecastTemp;
                forecastTodayUi.Summary.text = comment;
            }
            resolve(0);
        }
        catch (e) {
            reject(e);
        }
    });
}

/**
 *
 * @returns {Promise<unknown>}
 */
function populateForecastUI() {
    return new Promise((resolve, reject) => {
        try {
            // Populate 5 day / 3 hour forecast UI
            let forecast = this.forecastWeatherCache;

            for (let i = 0; i < this.forecastDays; i++) {
                let forecastUi = this.forecast[i];
                let forecastData = forecast[i];

                for (let j = 0; j < 8; j++) {
                    if (forecastData[j] === undefined) {
                        continue;
                    }


                    let forecastDate = new Date(forecastData[j].dt * 1000);
                    if (j === 0) {
                        let beginOfDay = new Date(new Date().setHours(0, 0, 0, 0));
                        let dayLeft = Math.floor((forecastDate.getTime() - beginOfDay.getTime()) / 86400000);

                        if (dayLeft === 1) {
                            forecastUi.Day.text = '\n'+_("Tomorrow");
                        } else {
                            forecastUi.Day.text = '\n' + WeatherUtils.getLocaleDay(forecastDate.getDay());
                        }
                    }

                    let iconTime     = forecastDate.toLocaleTimeString([this.locale], { hour12: false });
                    let iconname            = WeatherUtils.IconMap[forecastData[j].weather[0].icon];
                    let forecastTemp        = WeatherUtils.formatTemperature(forecastData[j].main.temp, this.units, this.decimalPlaces);

                    let comment = forecastData[j].weather[0].description;
                    if (this.translateCondition && !this.providerTranslations) {
                        comment = WeatherUtils.getWeatherCondition(forecastData[j].weather[0].id);
                    }

                    if (this.clockFormat === "24h") {
                        forecastDate = forecastDate.toLocaleTimeString([this.locale], { hour12: false });
                        forecastDate = forecastDate.substring(0, forecastDate.length -3);
                    }
                    else {
                        forecastDate = forecastDate.toLocaleTimeString([this.locale], { hour: 'numeric' });
                    }

                    forecastUi[j].Time.text = forecastDate;
                    forecastUi[j].Icon.set_gicon(this.getWeatherIcon(iconname));
                    forecastUi[j].Temperature.text = forecastTemp;
                    forecastUi[j].Summary.text = comment;
                }
            }
            resolve(0);
        }
        catch (e) {
            reject(e);
        }
    });
}



/**
 *
 * @param json
 * @returns {Promise<unknown>}
 */
function processTodaysData(json) {
    return new Promise((resolve, reject) => {
        try {
            let data = json.list;
            let todayList = [];

            for (let i = 0; i < 4; i++)
                todayList.push(data[i]);

            resolve(todayList);
        }
        catch (e) {
            reject(e);
        }
    });
}

/**
 *
 * @param json
 * @returns {Promise<unknown>}
 */
function processForecastData(json) {
    return new Promise((resolve, reject) => {
        try {
            let i = a = 0;
            let data = json.list;
            let sortedList = [];
            let now = new Date().toLocaleDateString([this.locale]);

            for (let j = 0; j < data.length; j++) {
                let _this = new Date(data[i].dt * 1000).toLocaleDateString([this.locale]);
                let last = new Date(data[((i===0) ? 0 : i-1)].dt * 1000).toLocaleDateString([this.locale]);

                if (now ===_this) {
                    // Don't add today's items
                    i++;
                    continue;
                }
                if (sortedList.length === 0) {
                    // First item in json list
                    sortedList[a] = [data[i]];
                    i++;
                    continue;
                }

                if (_this === last) {
                    // Add item to current day
                    sortedList[a].push(data[i]);
                } else {
                    if (sortedList.length === this.forecastDays) {
                        // If we reach the forecast limit set by the user
                        break;
                    }
                    // Otherwise start a new day
                    a = a+1;
                    sortedList[a] = [];
                    sortedList[a].push(data[i]);
                }
                i++;
            }
            resolve(sortedList);
        }
        catch (e) {
            reject(e);
        }
    });
}



