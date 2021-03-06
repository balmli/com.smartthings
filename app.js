'use strict';
const Homey = require('homey');
const https = require("https");
const POLL_INTERVAL = 3000;

const CapabilityMap2 = {
	"switch": {
		capabilities: ["onoff"],
		icon: "socket.svg"
	},
	"switchLevel": {
		capabilities: ["dim"],
		icon: "light.svg"
	},
	"contactSensor": {
		capabilities: ["alarm_contact"],
		icon: "door.svg"
	},
	"battery": {
		capabilities: ["measure_battery"],
		icon: ""
	},
	"presenceSensor": {
		capabilities: ["alarm_presence"],
		icon: "presence.svg"
	},
	"powerConsumptionReport": {
		capabilities: ["measure_power", "meter_power", "meter_power.delta"],
		icon: ""
	},
	"remoteControlStatus": {
		capabilities: ["remote_status"],
		icon: ""
	},
	"washerOperatingState": {
		capabilities: ["washer_mode", "washer_job_status", "completion_time"],
		icon: ""
	},
	"custom.washerWaterTemperature": {
		capabilities: ["water_temperature"],
		icon: ""
	},
	"custom.washerSpinLevel": {
		capabilities: ["spin_level"],
		icon: ""
	},
	"custom.washerRinseCycles": {
		capabilities: ["rinse_cycles"],
		icon: ""
	},
	"washerMode": {
		capabilities: ["washer_status"],
		icon: "washingmachine.svg"
	},
	"audioVolume": {
		capabilities: ["volume_down", "volume_up"],
		icon: ""
	},
	"tvChannel": {
		capabilities: ["channel_down", "channel_up"],
		icon: ""
	},
};

class MyApp extends Homey.App {

	onInit() {
		this.log('SmartThings is running...');

		this.BearerToken = Homey.ManagerSettings.get('BearerToken');
		if (Homey.ManagerSettings.get('pollInterval') < 1) {
			Homey.ManagerSettings.set('pollInterval', 5);
		}

		this.log("SmartThings has started with Key: " + this.BearerToken + " Polling every " + Homey.ManagerSettings.get('pollInterval') + " seconds");

		// Callback for app settings changed
		Homey.ManagerSettings.on('set', async function (setting) {
			if (setting != 'diaglog') {
				Homey.app.log("Setting " + setting + " has changed.");

				if (setting === 'pollInterval') {
					clearTimeout(Homey.app.timerID);
					if (Homey.app.BearerToken && !Homey.app.timerProcessing) {
						if (Homey.ManagerSettings.get('pollInterval') > 1) {
							Homey.app.timerID = setTimeout(Homey.app.onPoll, Homey.ManagerSettings.get('pollInterval') * 1000);
						}
					}
				}
			}
		});

		this.onPoll = this.onPoll.bind(this);

		if (this.BearerToken) {
			if (Homey.ManagerSettings.get('pollInterval') > 1) {
				this.updateLog("Start Polling");
				this.timerID = setTimeout(this.onPoll, 10000);
			}
		}

		this.updateLog('************** App has initialised. ***************');
	}

	async getDevices() {
		//https://api.smartthings.com/v1/devices
		const url = "devices";
		let searchResult = await Homey.app.GetURL(url);
		if (searchResult) {
			let searchData = JSON.parse(searchResult.body);
			//Homey.app.updateLog(JSON.stringify(searchData, null, 2));
			const devices = [];

			// Create an array of devices
			for (const device of searchData['items']) {
				Homey.app.updateLog("Found device: ");
				Homey.app.updateLog(device);

				var data = {};
				data = {
					"id": device['deviceId'],
				};

				var iconName = "";
				var components = device['components'];
				var mainComponent = components[0];
				// Find supported capabilities
				var deviceCapabilities = mainComponent['capabilities'];
				var capabilities = [];

				for (const deviceCapability of deviceCapabilities) {

					const capabilityMapEntry = CapabilityMap2[deviceCapability['id']];
					if (capabilityMapEntry != null) {
						//Add to the table
						Homey.app.updateLog(capabilityMapEntry);
						if (capabilityMapEntry.icon)
						{
							iconName = capabilityMapEntry.icon;
						}
						capabilityMapEntry.capabilities.forEach(element => {
							capabilities.push(element);
						});
					}
				}
				if (capabilities.length > 0) {
					// Add this device to the table
					devices.push({
						"name": device['label'],
						"icon": iconName, // relative to: /drivers/<driver_id>/assets/
						"capabilities": capabilities,
						data
					})
				}
			}

			return devices;
		} else {
			Homey.app.updateLog("Getting API Key returned NULL");
			reject({
				statusCode: -3,
				statusMessage: "HTTPS Error: Nothing returned"
			});
		}
	}

	async getDeviceCapabilityValue(DeviceID, CapabilityID) {
		//https://api.smartthings.com/v1/devices/{deviceId}/components/{componentId}/capabilities/{capabilityId}/status
		let url = "devices/" + DeviceID + "/components/main/capabilities/" + CapabilityID + "/status";
		let result = await this.GetURL(url);
		if (result) {
			let searchData = JSON.parse(result.body);
			Homey.app.updateLog(JSON.stringify(searchData, null, 2));
			return searchData;
		}

		return -1;
	}

	async setDeviceCapabilityValue(DeviceID, Commands) {
		//https://api.smartthings.com/v1/devices/{deviceId}/commands
		let url = "devices/" + DeviceID + "/commands";
		let result = await this.PostURL(url, Commands);
		if (result) {
			let searchData = JSON.parse(result.body);
			Homey.app.updateLog(JSON.stringify(searchData, null, 2));
			return searchData;
		}

		return -1;
	}

	async GetURL(url) {
		Homey.app.updateLog(url);

		return new Promise((resolve, reject) => {
			try {
				if (!Homey.app.BearerToken) {
					reject({
						statusCode: 401,
						statusMessage: "HTTPS: No Token specified"
					});
				}

				let https_options = {
					host: "api.smartthings.com",
					path: "/v1/" + url,
					headers: {
						"Authorization": "Bearer " + Homey.app.BearerToken,
					},
				}

				https.get(https_options, (res) => {
					if (res.statusCode === 200) {
						let body = [];
						res.on('data', (chunk) => {
							body.push(chunk);
						});
						res.on('end', () => {
							resolve({
								"body": Buffer.concat(body)
							});
						});
					} else {
						let message = "";
						if (res.statusCode === 204) {
							message = "No Data Found";
						} else if (res.statusCode === 400) {
							message = "Bad request";
						} else if (res.statusCode === 401) {
							message = "Unauthorized";
						} else if (res.statusCode === 403) {
							message = "Forbidden";
						} else if (res.statusCode === 404) {
							message = "Not Found";
						}
						Homey.app.updateLog("HTTPS Error: " + res.statusCode + ": " + message);
						reject({
							statusCode: res.statusCode,
							statusMessage: "HTTPS Error: " + message
						});
					}
				}).on('error', (err) => {
					Homey.app.updateLog(err);
					reject({
						statusCode: -1,
						statusMessage: "HTTPS Catch : " + err
					});
				});
			} catch (err) {
				Homey.app.updateLog(err);
				reject({
					statusCode: -2,
					statusMessage: "HTTPS Catch: " + err
				});
			}
		});
	}

	async PostURL(url, body) {
		Homey.app.updateLog(url);
		let bodyText = JSON.stringify(body);
		Homey.app.updateLog(bodyText);

		return new Promise((resolve, reject) => {
			try {
				if (!Homey.app.BearerToken) {
					reject({
						statusCode: 401,
						statusMessage: "HTTPS: No Token specified"
					});
				}

				let https_options = {
					host: "api.smartthings.com",
					path: "/v1/" + url,
					method: "POST",
					headers: {
						"Authorization": "Bearer " + Homey.app.BearerToken,
						"contentType": "application/json; charset=utf-8",
						"Content-Length": bodyText.length
					},
				}

				Homey.app.updateLog(https_options);

				let req = https.request(https_options, (res) => {
					if (res.statusCode === 200) {
						let body = [];
						res.on('data', (chunk) => {
							Homey.app.updateLog("retrieve data");
							body.push(chunk);
						});
						res.on('end', () => {
							Homey.app.updateLog("Done retrieval of data");
							resolve({
								"body": Buffer.concat(body)
							});
						});
					} else {
						let message = "";
						if (res.statusCode === 204) {
							message = "No Data Found";
						} else if (res.statusCode === 400) {
							message = "Bad request";
						} else if (res.statusCode === 401) {
							message = "Unauthorized";
						} else if (res.statusCode === 403) {
							message = "Forbidden";
						} else if (res.statusCode === 404) {
							message = "Not Found";
						}
						Homey.app.updateLog("HTTPS Error: " + res.statusCode + ": " + message);
						reject({
							statusCode: res.statusCode,
							statusMessage: "HTTPS Error: " + message
						});
					}
				}).on('error', (err) => {
					Homey.app.updateLog(err);
					reject({
						statusCode: -1,
						statusMessage: "HTTPS Catch : " + err
					});
				});
				req.write(bodyText);
				req.end();
			} catch (err) {
				Homey.app.updateLog(err);
				reject({
					statusCode: -2,
					statusMessage: "HTTPS Catch: " + err
				});
			}
		});
	}

	async onPoll() {
		Homey.app.timerProcessing = true;
		const promises = [];
		try {
			// Fetch the list of drivers for this app
			const drivers = Homey.ManagerDrivers.getDrivers();
			for (const driver in drivers) {
				let devices = Homey.ManagerDrivers.getDriver(driver).getDevices();
				for (var i = 0; i < devices.length; i++) {
					let device = devices[i];
					if (device.getDeviceValues) {
						promises.push(device.getDeviceValues());
					}
				}
			}

			await Promise.all(promises);

		} catch (err) {
			Homey.app.updateLog("Polling Error: " + err);
		}

		var nextInterval = Number(Homey.ManagerSettings.get('pollInterval')) * 1000;
		if (nextInterval < 1000) {
			nextInterval = 5000;
		}
		Homey.app.updateLog("Next Interval = " + nextInterval, true);
		Homey.app.timerID = setTimeout(Homey.app.onPoll, nextInterval);
		Homey.app.timerProcessing = false;
	}

	updateLog(newMessage) {
		Homey.app.log(newMessage);

		if (Homey.ManagerSettings.get('logEnabled')) {
			//Homey.app.log(newMessage);
			var oldText = Homey.ManagerSettings.get('diagLog');
			oldText += "* ";
			oldText += newMessage;
			oldText += "\r\n";
			Homey.ManagerSettings.set('diagLog', oldText);
		}
	}

}

module.exports = MyApp;