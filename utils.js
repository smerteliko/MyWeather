var WeatherProvider = {
    OPENWEATHERMAP: 0
};
var WeatherUnits = {
    CELSIUS: 0,
    FAHRENHEIT: 1,
    KELVIN: 2,
    RANKINE: 3,
    REAUMUR: 4,
    ROEMER: 5,
    DELISLE: 6,
    NEWTON: 7
};
var WeatherWindSpeedUnits = {
    KPH: 0,
    MPH: 1,
    MPS: 2,
    KNOTS: 3,
    FPS: 4,
    BEAUFORT: 5
};


var WeatherPressureUnits = {
    HPA: 0,
    INHG: 1,
    BAR: 2,
    PA: 3,
    KPA: 4,
    ATM: 5,
    AT: 6,
    TORR: 7,
    PSI: 8,
    MMHG: 9,
    MBAR: 10
};

var WeatherPosition = {
    CENTER: 0,
    RIGHT: 1,
    LEFT: 2
};



// Map OpenWeatherMap icon codes to icon names
var IconMap = {
    "01d": "weather-clear-symbolic",             // "clear sky"
    "02d": "weather-few-clouds-symbolic",        // "few clouds"
    "03d": "weather-few-clouds-symbolic",        // "scattered clouds"
    "04d": "weather-overcast-symbolic",          // "broken clouds"
    "09d": "weather-showers-scattered-symbolic", // "shower rain"
    "10d": "weather-showers-symbolic",           // "rain"
    "11d": "weather-storm-symbolic",             // "thunderstorm"
    "13d": "weather-snow-symbolic",              // "snow"
    "50d": "weather-fog-symbolic",               // "mist"
    "01n": "weather-clear-night-symbolic",       // "clear sky night"
    "02n": "weather-few-clouds-night-symbolic",  // "few clouds night"
    "03n": "weather-few-clouds-night-symbolic",  // "scattered clouds night"
    "04n": "weather-overcast-symbolic",          // "broken clouds night"
    "09n": "weather-showers-scattered-symbolic", // "shower rain night"
    "10n": "weather-showers-symbolic",           // "rain night"
    "11n": "weather-storm-symbolic",             // "thunderstorm night"
    "13n": "weather-snow-symbolic",              // "snow night"
    "50n": "weather-fog-symbolic"                // "mist night"
}

/**
 *  Codes from openweathermap API documentation
 * @param code
 * @returns {*}
 */
function getWeatherCondition(code) {
    switch (parseInt(code, 10)) {
        case 200: //Thunderstorm with light rain
            return _('Thunderstorm with Light Rain');
        case 201: //Thunderstorm with rain
            return _('Thunderstorm with Rain');
        case 202: //Thunderstorm with heavy rain
            return _('Thunderstorm with Heavy Rain');
        case 210: //Light thunderstorm
            return _('Light Thunderstorm');
        case 211: //Thunderstorm
            return _('Thunderstorm');
        case 212: //Heavy thunderstorm
            return _('Heavy Thunderstorm');
        case 221: //Ragged thunderstorm
            return _('Ragged Thunderstorm');
        case 230: //Thunderstorm with light drizzle
            return _('Thunderstorm with Light Drizzle');
        case 231: //Thunderstorm with drizzle
            return _('Thunderstorm with Drizzle');
        case 232: //Thunderstorm with heavy drizzle
            return _('Thunderstorm with Heavy Drizzle');
        case 300: //Light intensity drizzle
            return _('Light Drizzle');
        case 301: //Drizzle
            return _('Drizzle');
        case 302: //Heavy intensity drizzle
            return _('Heavy Drizzle');
        case 310: //Light intensity drizzle rain
            return _('Light Drizzle Rain');
        case 311: //Drizzle rain
            return _('Drizzle Rain');
        case 312: //Heavy intensity drizzle rain
            return _('Heavy Drizzle Rain');
        case 313: //Shower rain and drizzle
            return _('Shower Rain and Drizzle');
        case 314: //Heavy shower rain and drizzle
            return _('Heavy Rain and Drizzle');
        case 321: //Shower drizzle
            return _('Shower Drizzle');
        case 500: //Light rain
            return _('Light Rain');
        case 501: //Moderate rain
            return _('Moderate Rain');
        case 502: //Heavy intensity rain
            return _('Heavy Rain');
        case 503: //Very heavy rain
            return _('Very Heavy Rain');
        case 504: //Extreme rain
            return _('Extreme Rain');
        case 511: //Freezing rain
            return _('Freezing Rain');
        case 520: //Light intensity shower rain
            return _('Light Shower Rain');
        case 521: //Shower rain
            return _('Shower Rain');
        case 522: //Heavy intensity shower rain
            return _('Heavy Shower Rain');
        case 531: //Ragged shower rain
            return _('Ragged Shower Rain');
        case 600: //Light snow
            return _('Light Snow');
        case 601: //Snow
            return _('Snow');
        case 602: //Heavy snow
            return _('Heavy Snow');
        case 611: //Sleet
            return _('Sleet');
        case 612: //Light shower sleet
            return _('Light Shower Sleet');
        case 613: //Shower sleet
            return _('Shower Sleet');
        case 615: //Light rain and snow
            return _('Light Rain and Snow');
        case 616: //Rain and snow
            return _('Rain and Snow');
        case 620: //Light shower snow
            return _('Light Shower Snow');
        case 621: //Shower snow
            return _('Shower Snow');
        case 622: //Heavy shower snow
            return _('Heavy Shower Snow');
        case 701: //Mist
            return _('Mist');
        case 711: //Smoke
            return _('Smoke');
        case 721: //Haze
            return _('Haze');
        case 731: //Sand/Dust Whirls
            return _('Sand/Dust Whirls');
        case 741: //Fog
            return _('Fog');
        case 751: //Sand
            return _('Sand');
        case 761: //Dust
            return _('Dust');
        case 762: //volcanic ash
            return _('Volcanic Ash');
        case 771: //squalls
            return _('Squalls');
        case 781: //tornado
            return _('Tornado');
        case 800: //clear sky
            return _('Clear Sky');
        case 801: //Few clouds
            return _('Few Clouds');
        case 802: //Scattered clouds
            return _('Scattered Clouds');
        case 803: //Broken clouds
            return _('Broken Clouds');
        case 804: //Overcast clouds
            return _('Overcast Clouds');
        default:
            return _('Not available');
    }
}

/**
 *
 * @param units
 * @returns {*}
 */
function unitToUnicode(units) {
    if (units == WeatherUnits.FAHRENHEIT)
        return _('\u00B0F');
    else if (units == WeatherUnits.KELVIN)
        return _('K');
    else if (units == WeatherUnits.RANKINE)
        return _('\u00B0Ra');
    else if (units == WeatherUnits.REAUMUR)
        return _('\u00B0R\u00E9');
    else if (units == WeatherUnits.ROEMER)
        return _('\u00B0R\u00F8');
    else if (units == WeatherUnits.DELISLE)
        return _('\u00B0De');
    else if (units == WeatherUnits.NEWTON)
        return _('\u00B0N');
    else
        return _('\u00B0C');
}

/**
 *
 * @param t
 * @param decimalPlaces
 * @returns {string}
 */
function toFahrenheit(t, decimalPlaces) {
    return ((Number(t) * 1.8) + 32).toFixed(decimalPlaces);
}

/**
 *
 * @param t
 * @param decimalPlaces
 * @returns {string}
 */
function toKelvin(t, decimalPlaces) {
    return (Number(t) + 273.15).toFixed(decimalPlaces);
}

/**
 *
 * @param t
 * @param decimalPlaces
 * @returns {string}
 */
function toRankine(t, decimalPlaces) {
    return ((Number(t) * 1.8) + 491.67).toFixed(decimalPlaces);
}

/**
 *
 * @param t
 * @param decimalPlaces
 * @returns {string}
 */
function toReaumur(t, decimalPlaces) {
    return (Number(t) * 0.8).toFixed(decimalPlaces);
}

/**
 *
 * @param t
 * @param decimalPlaces
 * @returns {string}
 */
function toRoemer(t, decimalPlaces) {
    return ((Number(t) * 21 / 40) + 7.5).toFixed(decimalPlaces);
}

/**
 *
 * @param t
 * @param decimalPlaces
 * @returns {string}
 */
function toDelisle(t, decimalPlaces) {
    return ((100 - Number(t)) * 1.5).toFixed(decimalPlaces);
}

/**
 *
 * @param t
 * @param decimalPlaces
 * @returns {string}
 */
function toNewton(t, decimalPlaces) {
    return (Number(t) - 0.33).toFixed(decimalPlaces);
}

/**
 *
 * @param p
 * @param decimalPlaces
 * @returns {string}
 */
function toInHg(p /*, t*/, decimalPlaces) {
    return (p / 33.86530749).toFixed(decimalPlaces);
}

/**
 *
 * @param w
 * @param t
 * @returns {string|string}
 */
function toBeaufort(w, t) {
    if (w < 0.3)
        return (!t) ? "0" : "(" + _("Calm") + ")";

    else if (w >= 0.3 && w <= 1.5)
        return (!t) ? "1" : "(" + _("Light air") + ")";

    else if (w > 1.5 && w <= 3.4)
        return (!t) ? "2" : "(" + _("Light breeze") + ")";

    else if (w > 3.4 && w <= 5.4)
        return (!t) ? "3" : "(" + _("Gentle breeze") + ")";

    else if (w > 5, 4 && w <= 7.9)
        return (!t) ? "4" : "(" + _("Moderate breeze") + ")";

    else if (w > 7.9 && w <= 10.7)
        return (!t) ? "5" : "(" + _("Fresh breeze") + ")";

    else if (w > 10.7 && w <= 13.8)
        return (!t) ? "6" : "(" + _("Strong breeze") + ")";

    else if (w > 13.8 && w <= 17.1)
        return (!t) ? "7" : "(" + _("Moderate gale") + ")";

    else if (w > 17.1 && w <= 20.7)
        return (!t) ? "8" : "(" + _("Fresh gale") + ")";

    else if (w > 20.7 && w <= 24.4)
        return (!t) ? "9" : "(" + _("Strong gale") + ")";

    else if (w > 24.4 && w <= 28.4)
        return (!t) ? "10" : "(" + _("Storm") + ")";

    else if (w > 28.4 && w <= 32.6)
        return (!t) ? "11" : "(" + _("Violent storm") + ")";

    else
        return (!t) ? "12" : "(" + _("Hurricane") + ")";
}

/**
 *
 * @param abr
 * @returns {*}
 */
function getLocaleDay(abr) {
    let days = [_('Sunday'), _('Monday'), _('Tuesday'), _('Wednesday'), _('Thursday'), _('Friday'), _('Saturday')];
    return days[abr];
}

/**
 *
 * @param deg
 * @param direction
 * @returns {string|*}
 */
function getWindDirection(deg, direction) {
    let arrows = ["\u2193", "\u2199", "\u2190", "\u2196", "\u2191", "\u2197", "\u2192", "\u2198"];
    let letters = [_('N'), _('NE'), _('E'), _('SE'), _('S'), _('SW'), _('W'), _('NW')];
    let idx = Math.round(deg / 45) % arrows.length;
    return (direction) ? arrows[idx] : letters[idx];
}

/**
 *
 * @param pressure
 * @param units
 * @param decimalPlaces
 * @returns {string}
 */
function formatPressure(pressure, units, decimalPlaces) {
    let pressureUnit = _('hPa');
    switch (units) {
        case WeatherPressureUnits.INHG:
            pressure = this.toInHg(pressure,decimalPlaces);
            pressureUnit = _("inHg");
            break;

        case WeatherPressureUnits.HPA:
            pressure = pressure.toFixed(decimalPlaces);
            pressureUnit = _("hPa");
            break;

        case WeatherPressureUnits.BAR:
            pressure = (pressure / 1000).toFixed(decimalPlaces);
            pressureUnit = _("bar");
            break;

        case WeatherPressureUnits.PA:
            pressure = (pressure * 100).toFixed(decimalPlaces);
            pressureUnit = _("Pa");
            break;

        case WeatherPressureUnits.KPA:
            pressure = (pressure / 10).toFixed(decimalPlaces);
            pressureUnit = _("kPa");
            break;

        case WeatherPressureUnits.ATM:
            pressure = (pressure * 0.000986923267).toFixed(decimalPlaces);
            pressureUnit = _("atm");
            break;

        case WeatherPressureUnits.AT:
            pressure = (pressure * 0.00101971621298).toFixed(decimalPlaces);
            pressureUnit = _("at");
            break;

        case WeatherPressureUnits.TORR:
            pressure = (pressure * 0.750061683).toFixed(decimalPlaces);
            pressureUnit = _("Torr");
            break;

        case WeatherPressureUnits.PSI:
            pressure = (pressure * 0.0145037738).toFixed(decimalPlaces);
            pressureUnit = _("psi");
            break;

        case WeatherPressureUnits.MMHG:
            pressure = (pressure * 0.750061683).toFixed(decimalPlaces);
            pressureUnit = _("mmHg");
            break;

        case WeatherPressureUnits.MBAR:
            pressure = pressure.toFixed(decimalPlaces);
            pressureUnit = _("mbar");
            break;
    }
    return parseFloat(pressure).toLocaleString(this.locale) + ' ' + pressureUnit;
}

/**
 *
 * @param temperature
 * @param units
 * @param decimalPlaces
 * @returns {string}
 */
function formatTemperature(temperature, units, decimalPlaces) {
    switch (units) {
        case WeatherUnits.FAHRENHEIT:
            temperature = this.toFahrenheit(temperature, decimalPlaces);
            break;

        case WeatherUnits.CELSIUS:
            temperature = temperature.toFixed(decimalPlaces);
            break;

        case WeatherUnits.KELVIN:
            temperature = this.toKelvin(temperature, decimalPlaces);
            break;

        case WeatherUnits.RANKINE:
            temperature = this.toRankine(temperature, decimalPlaces);
            break;

        case WeatherUnits.REAUMUR:
            temperature = this.toReaumur(temperature, decimalPlaces);
            break;

        case WeatherUnits.ROEMER:
            temperature = this.toRoemer(temperature, decimalPlaces);
            break;

        case WeatherUnits.DELISLE:
            temperature = this.toDelisle(temperature, decimalPlaces);
            break;

        case WeatherUnits.NEWTON:
            temperature = this.toNewton(temperature, decimalPlaces);
            break;
    }
    return parseFloat(temperature).toLocaleString(this.locale).replace('-', '\u2212') + ' ' + unitToUnicode(units);
}

/**
 *
 * @param speed
 * @param direction
 * @param decimalPlaces
 * @param speedUnits
 * @returns {string}
 */
function formatWind(speed, direction, decimalPlaces, speedUnits) {
    let conv_MPSinMPH = 2.23693629;
    let conv_MPSinKPH = 3.6;
    let conv_MPSinKNOTS = 1.94384449;
    let conv_MPSinFPS = 3.2808399;
    let unit = _('m/s');

    switch (speedUnits) {
        case WeatherWindSpeedUnits.MPH:
            speed = (speed * conv_MPSinMPH).toFixed(decimalPlaces);
            unit = _('mph');
            break;

        case WeatherWindSpeedUnits.KPH:
            speed = (speed * conv_MPSinKPH).toFixed(decimalPlaces);
            unit = _('km/h');
            break;

        case WeatherWindSpeedUnits.MPS:
            speed = speed.toFixed(decimalPlaces);
            break;

        case WeatherWindSpeedUnits.KNOTS:
            speed = (speed * conv_MPSinKNOTS).toFixed(decimalPlaces);
            unit = _('kn');
            break;

        case WeatherWindSpeedUnits.FPS:
            speed = (speed * conv_MPSinFPS).toFixed(decimalPlaces);
            unit = _('ft/s');
            break;

        case WeatherWindSpeedUnits.BEAUFORT:
            speed = this.toBeaufort(speed);
            unit = this.toBeaufort(speed, true);
            break;
    }

    if (!speed)
        return '\u2013';
    else if (speed === 0 || !direction)
        return parseFloat(speed).toLocaleString(this.locale) + ' ' + unit;
    else // i.e. speed > 0 && direction
        return direction + ' ' + parseFloat(speed).toLocaleString(this.locale) + ' ' + unit;
}




