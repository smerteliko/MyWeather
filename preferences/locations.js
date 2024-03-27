const {
    Adw, Gtk, GObject, Soup, GLib
} = imports.gi;
const ByteArray = imports.byteArray;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const WeatherUtils = Me.imports.utils;
const _ = Gettext.gettext;
const Messages = imports.gi.Soup.Message;
// Keep enums in sync with GSettings schemas
const GeolocationProvider = {
    OPENSTREETMAPS: 0,
};

var Locations = GObject.registerClass(
    class MyWeatherLocationsPage extends Adw.PreferencesPage {
        _init(parent, settings) {
            super._init({
                title: _("Locations"),
                icon_name: 'find-location-symbolic',
                name: 'LocationsPage'
            });
            this.window = parent;
            this.settings = settings;
            this.count = null;
            this.locListUi = null;
            this.actualCity = this.settings.get_int('actual-city');
            let locationProvider = this.settings.get_enum('geolocation-provider');

            // Locations list group
            let addLocationButton = new Gtk.Button({
                child: new Adw.ButtonContent({
                    icon_name: 'list-add-symbolic',
                    label: _("Add")
                })
            });
            this.locationsGroup = new Adw.PreferencesGroup({
                title: _("Locations"),
                header_suffix: addLocationButton
            });
            this.refreshLocations();
            this.add(this.locationsGroup);

            // Bind signals
            addLocationButton.connect('clicked', this.addLocation.bind(this));
            // Detect change in locations
            this.settings.connect('changed', () => {
                if (this.locationsChanged()) {
                    this.actualCity = this.settings.get_int('actual-city');
                    this.refreshLocations();
                }
            });
        }
        refreshLocations() {
            let _city = this.settings.get_string('city');

            // Check if the location list UI needs updating
            if (this.locListUi !== _city) {
                if (_city.length > 0) {

                    // Remove the old list
                    if (this.count) {
                        for (var i = 0; i < this.count; i++) {
                            this.locationsGroup.remove(this.location[i].Row);
                        }
                        this.count = null;
                    }
                    let city = String(_city).split(" && ");
                    if (city && typeof city === "string") {
                        city = [city];
                    }
                    this.location = {};
                    // Build new location UI list
                    for (let i in city) {
                        this.location[i] = {};
                        this.location[i].ButtonBox = new Gtk.Box({
                            orientation: Gtk.Orientation.HORIZONTAL,
                            halign: Gtk.Align.CENTER,
                            spacing: 5,
                            hexpand: false,
                            vexpand: false
                        });
                        this.location[i].EditButton = new Gtk.Button({
                            icon_name: 'document-edit-symbolic',
                            valign: Gtk.Align.CENTER,
                            hexpand: false,
                            vexpand: false
                        });
                        this.location[i].DeleteButton = new Gtk.Button({
                            icon_name: 'edit-delete-symbolic',
                            valign: Gtk.Align.CENTER,
                            css_classes: ['error'],
                            hexpand: false,
                            vexpand: false
                        });
                        this.location[i].Row = new Adw.ActionRow({
                            title: this.extractLocation(city[i]),
                            subtitle: this.extractCoord(city[i]),
                            icon_name: (i === this.actualCity) ? 'checkbox-checked-symbolic' : 'checkbox-symbolic',
                            activatable: true
                        });
                        this.location[i].ButtonBox.append(this.location[i].EditButton);
                        this.location[i].ButtonBox.append(this.location[i].DeleteButton);
                        this.location[i].Row.add_suffix(this.location[i].ButtonBox);
                        this.locationsGroup.add(this.location[i].Row);
                    }
                    // Bind signals
                    for (let i in this.location) {
                        this.location[i].EditButton.connect('clicked', () => {
                            this.editLocation(i);
                        });
                        this.location[i].DeleteButton.connect('clicked', () => {
                            this.deleteLocation(i);
                        });
                        this.location[i].Row.connect('activated', () => {
                            if (i !== this.actualCity) {
                                this.location[i].Row.set_icon_name('checkbox-checked-symbolic');
                                this.location[this.actualCity].Row.set_icon_name('checkbox-symbolic');
                                this.actualCity = i;
                                this.settings.set_int('actual-city', i);
                                let _toast = new Adw.Toast({
                                    title: _("Location changed to: %s").format(this.location[i].Row.get_title())
                                });
                                this.window.add_toast(_toast);
                            }
                            return 0;
                        });
                    }
                    this.count = Object.keys(this.location).length;
                }
                this.locListUi = _city;
            }
            return 0;
        }
        addLocation() {
            let dialog = new Gtk.Dialog({
                title: _("Add New Location"),
                use_header_bar: true,
                transient_for: this.window,
                default_width: 600,
                default_height: -1,
                modal: true
            });
            let dialogPage = new Adw.PreferencesPage();
            let dialogGroup = new Adw.PreferencesGroup();
            let dialogRow = new Adw.PreferencesRow({
                activatable: false,
                focusable: false
            });
            let dialogBox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                margin_top: 10,
                margin_bottom: 10,
                margin_start: 10,
                margin_end: 10
            });
            let findLabel = new Gtk.Label({
                label: _("Search by Location or Coordinates"),
                halign: Gtk.Align.START,
                margin_bottom: 5,
                hexpand: true
            });
            let findEntry = new Gtk.Entry({
                placeholder_text: _("e.g. Moscow, London or -8.5211767,179.1976747"),
                secondary_icon_name: 'edit-clear-symbolic',
                secondary_icon_tooltip_text: _("Clear entry"),
                valign: Gtk.Align.CENTER,
                activates_default: true,
                hexpand: true,
                vexpand: false
            });
            let searchButton = new Gtk.Button({
                child: new Adw.ButtonContent({
                    icon_name: 'edit-find-symbolic',
                    label: _("Search")
                }),
                css_classes: ['suggested-action']
            });
            dialog.add_action_widget(searchButton, 0);
            dialog.set_default_response(0);
            let dialogArea = dialog.get_content_area();

            dialogBox.append(findLabel);
            dialogBox.append(findEntry);
            dialogRow.set_child(dialogBox);
            dialogGroup.add(dialogRow);
            dialogPage.add(dialogGroup);
            dialogArea.append(dialogPage);
            dialog.show();

            // Bind signals
            dialog.connect('response', (w, response) => {
                if (response === 0) {
                    let location = findEntry.get_text().trim();
                    if (location === "") {
                        // no input
                        let _toast = new Adw.Toast({
                            title: _("We need something to search for!")
                        });
                        this.window.add_toast(_toast);
                        return 0;
                    }
                    let resultsWindow = new SearchResultsWindow(this.window, this.settings, location);
                    resultsWindow.show();
                }
                dialog.close();
                return 0;
            });
            findEntry.connect('icon-release', (widget) => {
                widget.set_text("");
            });
            dialog.connect('close-request', () => {
                dialog.destroy();
            });
            return 0;
        }
        editLocation(selected) {
            let city = this.settings.get_string('city').split(" && ");

            let dialog = new Gtk.Dialog({
                title: _("Edit %s").format(this.extractLocation(city[selected])),
                use_header_bar: true,
                transient_for: this.window,
                default_width: 600,
                default_height: -1,
                modal: true
            });
            let dialogPage = new Adw.PreferencesPage();
            let dialogGroup = new Adw.PreferencesGroup();
            let dialogRow = new Adw.PreferencesRow({
                activatable: false,
                focusable: false
            });
            let dialogBox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                margin_top: 10,
                margin_bottom: 10,
                margin_start: 10,
                margin_end: 10
            });
            // location display name
            let editNameLabel = new Gtk.Label({
                label: _("Edit Name"),
                halign: Gtk.Align.START,
                margin_bottom: 5,
                hexpand: true
            });
            let editNameEntry = new Gtk.Entry({
                text: this.extractLocation(city[selected]),
                secondary_icon_name: 'edit-clear-symbolic',
                secondary_icon_tooltip_text: _("Clear entry"),
                valign: Gtk.Align.CENTER,
                activates_default: true,
                hexpand: true,
                vexpand: false
            });
            // location coordinates
            let editCoordLabel = new Gtk.Label({
                label: _("Edit Coordinates"),
                halign: Gtk.Align.START,
                margin_top: 10,
                margin_bottom: 5,
                hexpand: true
            });
            let editCoordEntry = new Gtk.Entry({
                text: this.extractCoord(city[selected]),
                secondary_icon_name: 'edit-clear-symbolic',
                secondary_icon_tooltip_text: _("Clear entry"),
                valign: Gtk.Align.CENTER,
                activates_default: true,
                hexpand: true,
                vexpand: false
            });
            let saveButton = new Gtk.Button({
                child: new Adw.ButtonContent({
                    icon_name: 'document-save-symbolic',
                    label: _("Save")
                }),
                css_classes: ['suggested-action']
            });
            dialog.add_action_widget(saveButton, 0);
            dialog.set_default_response(0);
            let dialogArea = dialog.get_content_area();

            dialogBox.append(editNameLabel);
            dialogBox.append(editNameEntry);
            dialogBox.append(editCoordLabel);
            dialogBox.append(editCoordEntry);
            dialogRow.set_child(dialogBox);
            dialogGroup.add(dialogRow);
            dialogPage.add(dialogGroup);
            dialogArea.append(dialogPage);
            dialog.show();

            // Bind signals
            editNameEntry.connect('icon-release', (widget) => {
                widget.set_text("");
            });
            editCoordEntry.connect('icon-release', (widget) => {
                widget.set_text("");
            });
            dialog.connect('response', (w, response) => {
                if (response === 0) {
                    let location = editNameEntry.get_text();
                    let coord = editCoordEntry.get_text();
                    let provider = 0; // preserved for future use

                    if (coord === "" || location === "") {
                        let _toast = new Adw.Toast({
                            title: _("Please complete all fields")
                        });
                        this.window.add_toast(_toast);
                        return 0;
                    }
                    if (city.length > 0 && typeof city !== "object") {
                        city = [city];
                    }
                    city[selected] = coord + ">" + location + ">" + provider;

                    if (city.length > 1) {
                        this.settings.set_string('city', city.join(" && "));
                    } else if (city[0]) {
                        this.settings.set_string('city', city[0]);
                    }
                    let toast = new Adw.Toast({
                        title: _("%s has been updated").format(location)
                    });
                    this.window.add_toast(toast);
                }
                dialog.close();
                return 0;
            });
            dialog.connect('close-request', () => {
                dialog.destroy();
            });
            return 0;
        }
        deleteLocation(selected) {
            let city = this.settings.get_string('city').split(" && ");
            if (!city.length) {
                return 0;
            }
            let dialog = new Gtk.Dialog({
                title: "",
                use_header_bar: true,
                transient_for: this.window,
                resizable: false,
                modal: true
            });
            let dialogPage = new Adw.PreferencesPage();
            let dialogGroup = new Adw.PreferencesGroup();
            let selectedName = this.extractLocation(city[selected]);

            let dialogRow = new Adw.ActionRow({
                title: _("Are you sure you want to delete \"%s\"?").format(selectedName),
                icon_name: 'help-about-symbolic',
                activatable: false,
                focusable: false
            });
            let dialogButton = new Gtk.Button({
                child: new Adw.ButtonContent({
                    icon_name: 'edit-delete-symbolic',
                    label: _("Delete")
                }),
                css_classes: ['destructive-action']
            });
            dialog.add_button(_("Cancel"), 0);
            dialog.add_action_widget(dialogButton, 1);
            dialog.set_default_response(0);

            let dialogArea = dialog.get_content_area();
            dialogGroup.add(dialogRow);
            dialogPage.add(dialogGroup);
            dialogArea.append(dialogPage);
            dialog.show();

            dialog.connect('response', (w, response) => {
                if (response === 1) {
                    if (city.length === 0) {
                        city = [];
                    }
                    if (city.length > 0 && typeof city !== "object") {
                        city = [city];
                    }
                    if (city.length > 0) {
                        city.splice(selected, 1);
                    }
                    if (this.actualCity === selected) {
                        this.settings.set_int('actual-city', 0);
                    }
                    if (city.length > 1) {
                        this.settings.set_string('city', city.join(" && "));
                    } else if (_city[0]) {
                        this.settings.set_string('city', city[0]);
                    } else {
                        this.settings.set_string('city', "");
                    }
                    let toast = new Adw.Toast({
                        title: _("%s has been deleted").format(selectedName)
                    });
                    this.window.add_toast(toast);
                }
                dialog.close();
                return 0;
            });
            dialog.connect('close-request', () => {
                dialog.destroy();
            });
            return 0;
        }
        locationsChanged() {
            let city = this.settings.get_string('city');
            if (this.locListUi !== city) {
                return true;
            }
            return false;
        }
        extractLocation() {
            if (!arguments[0]) {
                return "";
            }
            if (arguments[0].search(">") === -1) {
                return _("Invalid city");
            }
            return arguments[0].split(">")[1].trim();
        }
        extractCoord() {
            if (!arguments[0]) {
                return 0;
            }
            if (arguments[0].search(">") === -1) {
                return 0;
            }
            return arguments[0].split(">")[0];
        }
    });

/*
    Search results window
*/
var SearchResultsWindow = GObject.registerClass(
    class MyWeatherSearchResultsWindow extends Adw.PreferencesWindow {
        _init(parent, settings, location) {
            super._init({
                title: _("Search Results"),
                transient_for: parent,
                search_enabled: false,
                modal: true
            });
            let mainPage = new Adw.PreferencesPage();
            this.add(mainPage);
            this.window = parent;
            this.settings = settings;
            this.location = location;
            this.provider = this.settings.get_enum('geolocation-provider');

            // Search results group
            let searchButton = new Gtk.Button({
                child: new Adw.ButtonContent({
                    icon_name: 'edit-find-symbolic',
                    label: _("New Search")
                })
            });
            this.resultsGroup = new Adw.PreferencesGroup({
                header_suffix: searchButton
            });
            this.resultsStatus = new Adw.StatusPage({
                title: _("Searching ..."),
                description: _("Please wait while searching for locations matching \"%s\"").format(this.location),
                icon_name: 'edit-find-symbolic',
                hexpand: true,
                vexpand: true
            });
            this.resultsGroup.add(this.resultsStatus);
            mainPage.add(this.resultsGroup);
            // Query provider and load the results
            this.findLocation();

            // Bind signals
            searchButton.connect('clicked', () => {
                this.window.get_visible_page().addLocation();
                this.close();
                return 0;
            });
            this.connect('close-request', this.destroyLoc.bind(this));
        }

        /**
         *
         * @returns {Promise<number>}
         */
        async findLocation() {
            let json = null;
            // OpenStreetMaps
            if (this.provider === GeolocationProvider.OPENSTREETMAPS) {
                let params = {
                    format: 'json',
                    addressdetails: '1',
                    q: this.location
                };
                let osmUrl = 'https://nominatim.openstreetmap.org/search';
                try {
                    json = await this.loadJsonAsync(osmUrl, params)
                        .then(async (json) => {
                            try {
                                if (!json) {
                                    this.resultsError(true);
                                    throw new Error("Server returned an invalid response");
                                }
                                if (Number(json.length) < 1) {
                                    this.resultsError(false);
                                    return 0;
                                } else {
                                    await this.processResults(json);
                                    return 0;
                                }
                            }catch (e) {
                                log("processResults OpenStreetMap error: " + e);
                            }
                        });
                }
                catch (e) {
                    log("findLocation OpenStreetMap error: " + e);
                }
            }
            return 0;
        }


        /**
         *
         * @param json
         * @returns {Promise<unknown>}
         */
        processResults(json) {
            return new Promise((resolve, reject) => {
                try {
                    this.resultsUi = {};
                    this.resultsGroup.remove(this.resultsStatus);
                    this.resultsGroup.set_title(_("Results for \"%s\"").format(this.location));
                    // Build search results list UI
                    for (let i in json) {
                        this.resultsUi[i] = {};

                        let cityText = json[i]['display_name'];
                        let cityCoord = json[i]['lat'] + "," + json[i]['lon'];
                        this.resultsUi[i].Row = new Adw.ActionRow({
                            title: cityText,
                            subtitle: cityCoord,
                            icon_name: 'find-location-symbolic',
                            activatable: true
                        });
                        this.resultsGroup.add(this.resultsUi[i].Row);
                    }
                    // Bind signals
                    for (let i in this.resultsUi) {
                        this.resultsUi[i].Row.connect('activated', (widget) => {
                            this.saveResult(widget);
                            return 0;
                        });
                    }
                    resolve(0);
                }
                catch (e) {
                    reject("Error processing results: " + e);
                }
            });
        }

        /**
         *
         * @param widget
         * @returns {number}
         */
        saveResult(widget) {
            let location = widget.get_title();
            let coord = widget.get_subtitle();
            let city = this.settings.get_string('city');

            if (city) {
                city = city + " && " + coord + ">" + location + ">0";
                this.settings.set_string('city', city);
            }
            else {
                city = coord + ">" + location + ">0";
                this.settings.set_string('city', city);
            }
            let toast = new Adw.Toast({
                title: _("%s has been added").format(location)
            });
            this.window.add_toast(toast);
            this.close();
            return 0;
        }

        /**
         *
         * @param error
         * @returns {number}
         */
        resultsError(error) {
            if (error) {
                this.resultsStatus.set_title(_("API Error"));
                this.resultsStatus.set_description(_("Invalid data when searching for \"%s\".").format(this.location));
                this.resultsStatus.set_icon_name('dialog-error-symbolic');
            } else {
                this.resultsStatus.set_title(_("No Matches Found"));
                this.resultsStatus.set_description(_("No results found when searching for \"%s\".").format(this.location));
            }
            return 0;
        }

        /**
         *
         * @returns {number}
         */
        destroyLoc() {
            this.destroy();
            return 0;
        }
    });
