
import XRDevice from "../devices/XRDevice";
import { PRIVATE as XRSESSION_PRIVATE } from '../api/XRSession';
import GamepadXRInputSource from "../devices/GamepadXRInputSource";
import { vec3, quat, mat4, } from 'gl-matrix/src/gl-matrix';

import NrealBridge from './NrealBridge';


/**
 * A Session helper class to mirror an XRSession and correlate
 * between an XRSession, and tracking sessions in a XRDevice.
 * Mostly referenced via `session.id` due to needing to verify
 * session creation is possible on the XRDevice before
 * the XRSession can be created.
 */
let SESSION_ID = 0;
class Session {
    constructor(mode, enabledFeatures) {
        this.mode = mode;
        this.enabledFeatures = enabledFeatures;
        this.immersive = mode == 'immersive-vr' || mode == 'immersive-ar';
        this.ended = false;
        this.baseLayer = null;
        this.id = ++SESSION_ID;
    }
}



const DIV_Z_INDEX = '9999';
export default class NRDevice extends XRDevice {


    constructor(global, config = {}) {
        super(global);
        this.sessions = new Map();
        this.modes = ['inline', 'immersive-vr', 'immersive-ar'];
        // TODO: what's the features standfor.
        // TODO: determined the support feature by device config. 
        this.features = ['viewer', 'local', 'local-floor', 'bounded-floor', 'unbounded', 'dom-overlay'];

        // @TODO: Edit this comment
        // For case where baseLayer's canvas isn't in document.body

        this.div = document.createElement('div');
        this.div.style.position = 'absolute';
        this.div.style.width = '100%';
        this.div.style.height = '100%';
        this.div.style.top = '0';
        this.div.style.left = '0';
        this.div.style.zIndex = DIV_Z_INDEX; // To override window overall
        this.originalCanvasParams = {
            parentElement: null,
            width: 0,
            height: 0
        };


        this.bridge = window.nrBridge;
        // this.bridge.endSessions = this._endSessions;
        // controllers
        this.gamepadInputSources = [];
        const inputSourceImpl = new GamepadXRInputSource(this, {}, 0, 1);
        inputSourceImpl.active = true;
        this.gamepadInputSources.push(inputSourceImpl);


        this.debugout = true;
    }



    /**
     * Called when a XRSession has a `baseLayer` property set.
     *
     * @param {number} sessionId
     * @param {XRWebGLLayer} layer
     */
    onBaseLayerSet(sessionId, layer) {
        const session = this.sessions.get(sessionId);


        // Remove old canvas first
        if (session.immersive && session.baseLayer) {
            this._removeBaseLayerCanvasFromDiv(sessionId);
        }

        session.baseLayer = layer;
        if (session.immersive && session.baseLayer) {
            this._appendBaseLayerCanvasToDiv(sessionId);
            // if (session.ar) {
            //     const canvas = session.baseLayer.context.canvas;
            //     canvas.width = this.resolution.width;
            //     canvas.height = this.resolution.height;
            //     this.arScene.setCanvas(canvas);
            //     if (canvas.parentElement) {
            //         // Not sure why but this is necessary for Firefox.
            //         // Otherwise, the canvas won't be rendered in AR scene.
            //         // @TODO: Figure out the root issue and resolve.
            //         canvas.parentElement.removeChild(canvas);
            //     }
            // }
        }
    }

    /**
     * @param {XRSessionMode} mode
     * @return {boolean}
     */
    isSessionSupported(mode) {
        return this.modes.includes(mode);
    }

    /**
     * @param {string} featureDescriptor
     * @return {boolean}
     */
    isFeatureSupported(featureDescriptor) {

        if (this.features.includes(featureDescriptor)) {
            return true;
        }

        // Test value
        switch (featureDescriptor) {
            case 'viewer': return true;
            case 'local': return true;
            case 'local-floor': return true;
            case 'bounded-floor': return false;
            case 'unbounded': return false;
            case 'dom-overlay': return true;
            default: return false;
        }

    }

    /**
     * Returns a promise if creating a session is successful.
     * Usually used to set up presentation in the device.
     *
     * @param {XRSessionMode} mode
     * @param {Set<string>} enabledFeatures
     * @return {Promise<number>}
     */
    async requestSession(mode, enabledFeatures) {
        console.log('request session from NRDevice ' + mode);
        if (!this.isSessionSupported(mode)) {
            return Promise.reject();
        }

        let immersive = mode === 'immersive-vr' || mode === 'immersive-ar';
        const session = new Session(mode, enabledFeatures);
        this.sessions.set(session.id, session);

        if (immersive) {
            this.immersiveSession = session;
            this.dispatchEvent('@@webxr-polyfill/vr-present-start', session.id);
        }


        // return Promise.resolve(session.id);
        // wait for
        let myFirstPromise = new Promise(function (resolve, reject) {
            //当异步代码执行成功时，我们才会调用resolve(...), 当异步代码失败时就会调用reject(...)
            //在本例中，我们使用setTimeout(...)来模拟异步代码，实际编码时可能是XHR请求或是HTML5的一些API方法.
            setTimeout(function () {
                resolve(session.id); //代码正常执行！
            }, 250);
        });

        return Promise.resolve(myFirstPromise);
    }

    /**
     * @return {Function}
     */
    requestAnimationFrame(callback) {

        console.log('XR requestAnimationFrame');
        this.bridge.animationCallback = callback;

        if (!this.bridge.needUpdate()) {
            return this.global.requestAnimationFrame(callback);
        }
        return 100;
    }

    /**
     * @param {number} sessionId
     */
    onFrameStart(sessionId, renderState) {

        const session = this.sessions.get(sessionId);

        // guaranteed by the caller that session.baseLayer is not null
        const context = session.baseLayer.context;

        const canvas = context.canvas;
        const near = renderState.depthNear;
        const far = renderState.depthFar;
        const width = canvas.width;
        const height = canvas.height;

        // If session is not an inline session, XRWebGLLayer's composition disabled boolean
        // should be false and then framebuffer should be marked as opaque.
        // The buffers attached to an opaque framebuffer must be cleared prior to the
        // processing of each XR animation frame.
        if (session.immersive) {
            const currentClearColor = context.getParameter(context.COLOR_CLEAR_VALUE);
            const currentClearDepth = context.getParameter(context.DEPTH_CLEAR_VALUE);
            const currentClearStencil = context.getParameter(context.STENCIL_CLEAR_VALUE);
            context.clearColor(0.0, 0.0, 0.0, 0.0);
            context.clearDepth(1, 0);
            context.clearStencil(0.0);
            context.clear(context.DEPTH_BUFFER_BIT | context.COLOR_BUFFER_BIT | context.STENCIL_BUFFER_BIT);
            context.clearColor(currentClearColor[0], currentClearColor[1], currentClearColor[2], currentClearColor[3]);
            context.clearDepth(currentClearDepth);
            context.clearStencil(currentClearStencil);
            // connect input source
            this._updateGamepadState(sessionId);
        }

    }
    /**
     * @param {number} sessionId
     */
    onFrameEnd(sessionId) {

        const session = this.sessions.get(sessionId);
        if (session.ended || !session.baseLayer) {
            return;
        }
        this.bridge.onFrameEnd(session);
    }

    /**
     * @param {number} sessionId
     * @param {XRReferenceSpaceType} type
     * @return {boolean}
     */
    doesSessionSupportReferenceSpace(sessionId, type) {
        const session = this.sessions.get(sessionId);
        if (session.ended) {
            return false;
        }
        return session.enabledFeatures.has(type);
    }

    /**
     * @return {Object?}
     */
    requestStageBounds() {
        // TODO: need?

        const width = 10;
        const depth = 10;
        const data = [];
        data.push(-width / 2); // X
        data.push(-depth / 2); // Z
        data.push(width / 2); // X
        data.push(-depth / 2); // Z
        data.push(width / 2); // X
        data.push(depth / 2); // Z
        data.push(-width / 2); // X
        data.push(depth / 2); // Z
        return data;
    }

    /**
     * Returns a promise resolving to a transform if XRDevice
     * can support frame of reference and provides its own values.
     * Can resolve to `undefined` if the polyfilled API can provide
     * a default. Rejects if this XRDevice cannot
     * support the frame of reference.
     *
     * @param {XRFrameOfReferenceType} type
     * @param {XRFrameOfReferenceOptions} options
     * @return {Promise<XRFrameOfReference>}
     */
    async requestFrameOfReferenceTransform(type, options) {
        // TODO: imp
        let matrix = mat4.create();
        if (type === 'local-floor' || type === 'bounded-floor') {
            mat4.fromTranslation(matrix, vec3.fromValues(0, 1.6, 0));
        } else {
            mat4.fromTranslation(matrix, vec3.fromValues(0, 0.0, 0));
        }

        return matrix;
    }

    /**
     * @param {number} handle
     */
    cancelAnimationFrame(handle) {
        this.global.cancelAnimationFrame(handle);
    }

    /**
     * @param {number} sessionId
     */
    endSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session.immersive && session.baseLayer) {
            this._removeBaseLayerCanvasFromDiv(sessionId);
            this.domOverlayRoot = null;
            if (session.ar) {
                this.arScene.eject();
                this.arScene.releaseCanvas();
            }
            this.dispatchEvent('@@webxr-polyfill/vr-present-end', sessionId);
            this._notifyLeaveImmersive();
        }
        session.ended = true;


        let myFirstPromise = new Promise(function (resolve, reject) {
            //当异步代码执行成功时，我们才会调用resolve(...), 当异步代码失败时就会调用reject(...)
            //在本例中，我们使用setTimeout(...)来模拟异步代码，实际编码时可能是XHR请求或是HTML5的一些API方法.
            setTimeout(function () {

            }, 250);
        });


    }

    /**
     * Allows the XRDevice to override the XRSession's view spaces.
     *
     * @param {XRSessionMode} mode
     * @return {Array<XRSpace> | undefined}
     */
    // getViewSpaces(mode) { return undefined; }

    /**
     * Takes a XREye and a target to apply properties of
     * `x`, `y`, `width` and `height` on. Returns a boolean
     * indicating if it successfully was able to populate
     * target's values.
     *
     * @param {number} sessionId
     * @param {XREye} eye
     * @param {XRWebGLLayer} layer
     * @param {Object?} target
     * @param {number} viewIndex
     * @return {boolean}
     */
    getViewport(sessionId, eye, layer, target, viewIndex) {
        const session = this.sessions.get(sessionId);
        // FIXME: should use the baselayer or this layer?
        const { width, height } = layer.context.canvas;

        if (!session.immersive) {
            target.x = target.y = 0;
            target.width = width;
            target.height = height;
            return true;
        }


        if (eye === 'none') {
            target.x = 0;
            target.width = width;
        } else {
            target.x = eye === 'left' ? 0 : width / 2;
            target.width = width / 2;
        }
        target.y = 0;
        target.height = height;

        return true;
    }

    /**
     * @param {XREye} eye
     * @param {number} viewIndex
     * @return {Float32Array}
     */
    getProjectionMatrix(eye, viewIndex) {
        if (eye === 'left' || eye === 'none') {
            return this.bridge.leftProjectionMatrix;
        } else if (eye === 'right') {
            return this.bridge.rightProjectionMatrix;
        } else {
            throw new Error(`eye must be of type 'left' , 'right' or 'none'`);
        }
    }

    /**
     * Get model matrix unaffected by frame of reference.
     *
     * @return {Float32Array}
     */
    getBasePoseMatrix() {
        return this.bridge.headPose;
    }

    /**
     * Get view matrix unaffected by frame of reference.
     *
     * @param {XREye} eye
     * @return {Float32Array}
     */
    getBaseViewMatrix(eye) {
        if (eye === 'left' || eye === 'none') {
            return this.bridge.leftViewMatrix;
        } else if (eye === 'right') {
            return this.bridge.rightViewMatrix;
        } else {
            throw new Error(`eye must be of type 'left' , 'right' or 'none'`);
        }
    }

    /**
     * Get a list of input sources.
     *
     * @return {Array<XRInputSource>}
     */
    getInputSources() {
        let inputSources = [];
        for (let i in this.gamepadInputSources) {
            inputSources.push(this.gamepadInputSources[i].inputSource);
        }
        return inputSources;
    }

    /**
     * Get the current pose of an input source.
     *
     * @param {XRInputSource} inputSource
     * @param {XRCoordinateSystem} coordinateSystem
     * @param {String} poseType
     * @return {XRPose}
     */
    getInputPose(inputSource, coordinateSystem, poseType) {

        if (!coordinateSystem) {
            return null;
        }

        for (let i in this.gamepadInputSources) {
            let inputSourceImpl = this.gamepadInputSources[i];
            if (inputSourceImpl.inputSource === inputSource) {
                return inputSourceImpl.getXRPose(coordinateSystem, poseType);
            }
        }
        return null;
    }
    /**
     * Called on window resize.
     */
    onWindowResize() {
        // Bound by XRDevice and called on resize, but
        // this will call child class onWindowResize (or, if not defined,
        // call an infinite loop I guess)
        // this.onWindowResize();

    }



    // Private methods

    // If session is immersive mode, resize the canvas size to full window size.
    // To do that, changing canvas size and moving the canvas to
    // the special div. They are restored when exiting immersive mode.
    // @TODO: Simplify the method names

    _appendBaseLayerCanvasToDiv(sessionId) {
        const session = this.sessions.get(sessionId);
        const canvas = session.baseLayer.context.canvas;

        this.originalCanvasParams.width = canvas.width;
        this.originalCanvasParams.height = canvas.height;

        document.body.appendChild(this.div);

        // If canvas is OffscreenCanvas we don't further touch so far.
        if (!(canvas instanceof HTMLCanvasElement)) { return; }

        this.originalCanvasParams.parentElement = canvas.parentElement;
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        this.div.appendChild(canvas);

        // DOM overlay API
        // @TODO: Is this the best place to handle?
        // @TODO: What if dom element is appened/removed while in immersive mode?
        //        Should we observe?
        if (this.domOverlayRoot) {
            const el = this.domOverlayRoot;
            el.style._zIndex = el.style.zIndex; // Polluting is bad...
            if (this.domOverlayRoot.contains(this.div)) {
                this.div.style.zIndex = '';
            } else {
                el.style.zIndex = DOM_OVERLAY_Z_INDEX;
            }
        }
    }

    _removeBaseLayerCanvasFromDiv(sessionId) {
        const session = this.sessions.get(sessionId);
        const canvas = session.baseLayer.context.canvas;

        canvas.width = this.originalCanvasParams.width;
        canvas.height = this.originalCanvasParams.height;

        // There may be a case where an application operates DOM elements
        // in immersive mode. In such case, we don't restore DOM elements
        // hierarchies so far.
        if (this.div.parentElement === document.body) {
            document.body.removeChild(this.div);
        }
        if (canvas.parentElement === this.div) {
            this.div.removeChild(canvas);
        }

        // If canvas is OffscreenCanvas we don't touch so far.
        if (!(canvas instanceof HTMLCanvasElement)) { return; }

        if (this.originalCanvasParams.parentElement) {
            this.originalCanvasParams.parentElement.appendChild(canvas);
        }
        this.originalCanvasParams.parentElement = null;

        // DOM overlay API
        // @TODO: Is this the best place to handle?
        if (this.domOverlayRoot) {
            const el = this.domOverlayRoot;
            el.style.zIndex = el.style._zIndex;
            delete el.style._zIndex;
            this.div.style.zIndex = DIV_Z_INDEX;
        }
    }

    _updateGamepadState(sessionId) {

        // if xr input sources mismatch with the gamepads
        if (this.gamepadInputSources.length != this.bridge.gamepads.length) {
            this.gamepadInputSources.length = 0;
            for (let i = 0; i < this.bridge.gamepads.length; i++) {
                const inputSourceImpl = new GamepadXRInputSource(this, {}, 0, 1);
                inputSourceImpl.active = true;
                this.gamepadInputSources.push(inputSourceImpl);
            }
        }


        for (let i = 0; i < this.bridge.gamepads.length; i++) {
            let gamepad = this.bridge.gamepads[i];

            let inputSourceImpl = this.gamepadInputSources[i];
            inputSourceImpl.updateFromGamepad(gamepad);
            // Process the primary action for the controller
            if (inputSourceImpl.primaryButtonIndex != -1) {
                let primaryActionPressed = gamepad.buttons[inputSourceImpl.primaryButtonIndex].pressed;
                if (primaryActionPressed && !inputSourceImpl.primaryActionPressed) {
                    this.dispatchEvent('@@webxr-polyfill/input-select-start', { sessionId: sessionId, inputSource: inputSourceImpl.inputSource });
                } else if (!primaryActionPressed && inputSourceImpl.primaryActionPressed) {
                    // This will also fire a select event
                    this.dispatchEvent('@@webxr-polyfill/input-select-end', { sessionId: sessionId, inputSource: inputSourceImpl.inputSource });
                }
                inputSourceImpl.primaryActionPressed = primaryActionPressed;
            }
            if (inputSourceImpl.primarySqueezeButtonIndex != -1) {
                let primarySqueezeActionPressed = gamepad.buttons[inputSourceImpl.primarySqueezeButtonIndex].pressed;
                if (primarySqueezeActionPressed && !inputSourceImpl.primarySqueezeActionPressed) {
                    this.dispatchEvent('@@webxr-polyfill/input-squeeze-start', { sessionId: sessionId, inputSource: inputSourceImpl.inputSource });
                } else if (!primarySqueezeActionPressed && inputSourceImpl.primarySqueezeActionPressed) {
                    // This will also fire a select event
                    this.dispatchEvent('@@webxr-polyfill/input-squeeze-end', { sessionId: sessionId, inputSource: inputSourceImpl.inputSource });
                }
                inputSourceImpl.primarySqueezeActionPressed = primarySqueezeActionPressed;
            }
        }
    }

    _endSessions() {
        for (let session of this.sessions) {
            // session.end()   

        }
    }
}

