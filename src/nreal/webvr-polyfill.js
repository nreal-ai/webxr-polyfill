import { vec3, mat4, mat3 } from 'gl-matrix/src/gl-matrix';

import NrealBridge from './NrealBridge';

function injectWebvrPolyfill(nrbridge) {

	'use strict';
	var NrealLight = {
		name: 'Nreal Light',
		resolution: { width: 1920, height: 1080 },
		features: { canPresent: true, hasExternalDisplay: false, hasOrientation: true, hasPosition: true },
		leftEye: { offset: -0.030, up: 40, down: 40, left: 40, right: 40 },
		rightEye: { offset: 0.030, up: 40, down: 40, left: 40, right: 40 }
	}

	var Eye = {
		LEFT: 'left',
		RIGHT: 'right'
	};
	var startDate = Date.now();
	var startPerfNow = performance.now();

	// WebVR 1.0

	function VRDisplayCapabilities() {
		this.canPresent = true;
		this.hasExternalDisplay = true;
		this.hasOrientation = true;
		this.hasPosition = true;
		this.maxLayers = 1
	}

	function VRStageParameters() {
		this.sittingToStandingTransform = new Float32Array([
			1, 0, 0, 0,
			0, 1, 0, 0,
			0, 0, 1, 0,
			0, 0, 0, 1
		]);

		this.sizeX = 5;
		this.sizeZ = 3;
	}

	function VRPose() {
		this.timestamp = startDate + (performance.now() - startPerfNow);
		this.position = new Float32Array([0, 0, 0]);
		this.linearVelocity = new Float32Array([0, 0, 0]);
		this.linearAcceleration = null;
		this.orientation = new Float32Array([0, 0, 0, 1]);
		this.angularVelocity = new Float32Array([0, 0, 0]);
		this.angularAcceleration = null;
	}

	function VRFieldOfView() {
		this.upDegrees = 0;
		this.downDegrees = 0;
		this.leftDegrees = 0;
		this.rightDegrees = 0;
	}

	function VREyeParameters() {
		this.offset = new Float32Array([0, 0, 0]);
		this.fieldOfView = new VRFieldOfView();
		this.renderWidth = 0;
		this.renderHeight = 0;
	}

	function VRLayer() {
		this.leftBounds = null;
		this.rightBounds = null;
		this.source = null;
	}

	function VRFrameData() {
		this.leftProjectionMatrix = new Float32Array(16);
		this.leftViewMatrix = new Float32Array(16);
		this.rightProjectionMatrix = new Float32Array(16);
		this.rightViewMatrix = new Float32Array(16);
		this.pose = null;
	}

	function createVRDisplayEvent(type, display, reason) {
		var event = new CustomEvent(type);
		event.display = display;
		event.reason = reason;
		return event;
	}
	function VRDisplay(nrBridge, model) {
		this.provider = window.nrprovider != undefined ? window.nrprovider : null;
		this.depthFar = 1000;
		this.depthNear = .1;
		this.displayId = 1;
		this.displayName = model.name;
		this.isConnected = true;
		this.isPresenting = false;

		this.layers = [];

		this.stageParameters = new VRStageParameters();

		this.capabilities = new VRDisplayCapabilities();
		this.capabilities.canPresent = model.features.canPresent;
		this.capabilities.hasExternalDisplay = model.features.hasExternalDisplay;
		this.capabilities.hasOrientation = model.features.hasOrientation;
		this.capabilities.hasPosition = model.features.hasPosition;

		this.pose = new VRPose();

		this.leftEyeParameters = new VREyeParameters();
		this.leftEyeParameters.fieldOfView.upDegrees = model.leftEye.up;
		this.leftEyeParameters.fieldOfView.downDegrees = model.leftEye.down;
		this.leftEyeParameters.fieldOfView.leftDegrees = model.leftEye.left;
		this.leftEyeParameters.fieldOfView.rightDegrees = model.leftEye.right;
		this.leftEyeParameters.renderWidth = model.resolution.width;
		this.leftEyeParameters.renderHeight = model.resolution.height;
		this.leftEyeParameters.offset[0] = model.leftEye.offset;

		this.rightEyeParameters = new VREyeParameters();
		this.rightEyeParameters.fieldOfView.upDegrees = model.rightEye.up;
		this.rightEyeParameters.fieldOfView.downDegrees = model.rightEye.down;
		this.rightEyeParameters.fieldOfView.leftDegrees = model.rightEye.left;
		this.rightEyeParameters.fieldOfView.rightDegrees = model.rightEye.right;
		this.rightEyeParameters.renderWidth = model.resolution.width;
		this.rightEyeParameters.renderHeight = model.resolution.height;
		this.rightEyeParameters.offset[0] = model.rightEye.offset;

		// read eye parameters 
		this.bridge = nrBridge;
		this.bridge.updateVrEyeParameters(this.leftEyeParameters, Eye.left);
		this.bridge.updateVrEyeParameters(this.rightEyeParameters, Eye.right)

		// TODO: fire these events while device status changees
		window.addEventListener('webvr-hmd-activate', function (e) {

			if (e.detail.state) {
				var event = createVRDisplayEvent('vrdisplayactivate', this, 'HMD activated');
				this.dispatchEvent(event);
			} else {
				var event = createVRDisplayEvent('vrdisplaydeactivate', this, 'HMD deactivated');
				this.dispatchEvent(event);
			}
		}.bind(this));

	}

	VRDisplay.prototype.requestAnimationFrame = function (c) {
		return this.bridge.requestAnimationFrame(callback);
	}

	VRDisplay.prototype.cancelAnimationFrame = function (handle) {
		return this.bridge.cancelAnimationFrame(handle);
	}

	VRDisplay.prototype.getEyeParameters = function (id) {
		if (id === Eye.left) return this.leftEyeParameters;
		return this.rightEyeParameters;
	}

	VRDisplay.prototype.getPose = function () {
		this.pose.timestamp = startDate + (performance.now() - startPerfNow);
		this.bridge.updateVrPose(this.pose);
		return this.pose;
	}

	VRDisplay.prototype.getFrameData = function (frameData) {
		this.bridge.updateVrFrameData(frameData);
		frameData.pose = this.getPose();
		return true;
	}

	VRDisplay.prototype.requestPresent = function (layers) {
		return new Promise(function (resolve, reject) {
			this.isPresenting = true;
			this.layers = [];
			layers.forEach(function (l) {
				var layer = new VRLayer();
				layer.source = l.source;
				if (l.leftBounds) layer.leftBounds = l.leftBounds;
				if (l.rightBounds) layer.rightBounds = l.rightBounds;
				this.layers.push(layer);
			}.bind(this));
			var event = createVRDisplayEvent('vrdisplaypresentchange', this, 'Presenting requested');

			this.dispatchEvent(event);
			console.log('WebVR requestPresent.');
			resolve();
		}.bind(this));
	}

	VRDisplay.prototype.exitPresent = function () {
		return new Promise(function (resolve, reject) {
			this.isPresenting = false;
			this.layers = [];
			var event = createVRDisplayEvent('vrdisplaypresentchange', this, 'Presenting exited');
			this.dispatchEvent(event);
			resolve();
		}.bind(this));
	}

	VRDisplay.prototype.submitFrame = function (pose) {
	}

	VRDisplay.prototype.resetPose = function () {
		var event = new Event('webvr-resetpose');
		this.dispatchEvent(event);
	}

	VRDisplay.prototype.dispatchEvent = function (event) {
		window.dispatchEvent(event);
		this.bridge.onEvent(event.type + '/' + event.reason);
	}

	VRDisplay.prototype.getLayers = function () {
		return this.layers;
	}

	function assignToWindow() {
		window.VRDisplay = VRDisplay;
		window.VRFrameData = VRFrameData;
		window.VRPose = VRPose;
	}

	assignToWindow();

	(function () {

		var vrD = new VRDisplay(nrbridge, NrealLight)
		navigator.getVRDisplays = function () {
			return new Promise(function (resolve, reject) {

				console.log('get vrdisplay from Nreal Webvr-polyfill.');
				resolve([vrD]);
			});
		}
	})();
	var event = new Event('webvr-ready');
	window.dispatchEvent(event);

}


export default injectWebvrPolyfill;