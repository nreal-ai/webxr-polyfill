
import XRDevice from "./XRDevice";
import { PRIVATE as XRSESSION_PRIVATE } from '../api/XRSession';
import GamepadXRInputSource from "./GamepadXRInputSource";
import {vec3,quat,mat4,} from 'gl-matrix/src/gl-matrix';


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


var g_frame_data = "";
var g_frame_data_state = 0;
var g_frame_data_count = 0;
var g_controller_data = "";
function prepareForNextFrame(frame_data) {
    console.log("prepareForNextFrame " + frame_data);

    var jsonObject = JSON.parse(frame_data);

    g_frame_data = jsonObject.headpose;
    g_controller_data = jsonObject.controller;

    g_frame_data_state = 1;
    g_frame_data_count++;
}

export default class NRDevice extends XRDevice {

    _onDeviceConnect() {

        const near = 0.01;
        const far = 1000;

        let fov = this.getEyeFov('left')
        mat4.frustum(this.leftProjectionMatrix, fov[0] * near, fov[1] * near, fov[2] * near, fov[3] * near, near, far);
        fov = this.getEyeFov('right')
        mat4.frustum(this.rightProjectionMatrix, fov[0] * near, fov[1] * near, fov[2] * near, fov[3] * near, near, far);

        this.eyeOffset = {
            left: this.getEyePoseFromHead('left'),
            right: this.getEyePoseFromHead('right'),
        };

    }

    constructor(global,config = {}) {
        super(global);
        // TODO:
        this.sessions = new Map();
        this.modes = ['inline', 'immersive-vr', 'immersive-ar'];
        this.features = ['viewer', 'local'];


        // headset pose
        this.poseMatrix = mat4.create();
        mat4.fromTranslation(this.poseMatrix, vec3.fromValues(0, 1.0, 0));

        // projection 
        this.leftProjectionMatrix = mat4.create();
        this.rightProjectionMatrix = mat4.create();
        // view matrix
        this.leftViewMatrix = mat4.create();
        this.rightViewMatrix = mat4.create();

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

        this.eyeOffset = {
            left: mat4.create(),
            right: mat4.create(),
        };

        this.provider = window.nrprovider != undefined ? window.nrprovider : null;
        this._onDeviceConnect();

        // controllers
        this.gamepads = [];
        this.gamepadInputSources = [];

        this.controllerCount = 0;
        this.controllerisTouching = new Array();
        this.controllerisButtonDown = new Array();
        this.controllerisButtonUp = new Array();
        this.controllerRay = new Array();



        this.debugout = true;

        this._initializeControllers(config);
        this.global.prepareForNextFrame = prepareForNextFrame;
    }



    /**
     * Called when a XRSession has a `baseLayer` property set.
     *
     * @param {number} sessionId
     * @param {XRWebGLLayer} layer
     */
    onBaseLayerSet(sessionId, layer) {

        // FIXME:?
        const session = this.sessions.get(sessionId);


        // Remove old canvas first
        if (session.immersive && session.baseLayer) {
            this._removeBaseLayerCanvasFromDiv(sessionId);
        }

        session.baseLayer = layer;
        if (session.immersive && session.baseLayer) {
            this._appendBaseLayerCanvasToDiv(sessionId);
            if (session.ar) {
                const canvas = session.baseLayer.context.canvas;
                canvas.width = this.resolution.width;
                canvas.height = this.resolution.height;
                this.arScene.setCanvas(canvas);
                if (canvas.parentElement) {
                    // Not sure why but this is necessary for Firefox.
                    // Otherwise, the canvas won't be rendered in AR scene.
                    // @TODO: Figure out the root issue and resolve.
                    canvas.parentElement.removeChild(canvas);
                }
            }
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

        // TODO: determined the support feature by device config. 
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
        if (!this.isSessionSupported(mode)) {
            return Promise.reject();
        }
        let immersive = mode === 'immersive-vr' || mode === 'immersive-ar';
        const session = new Session(mode, enabledFeatures);
        this.sessions.set(session.id, session);

        if (immersive) {

            // TODO: 
            this.immersiveSession = session;
            this.dispatchEvent('@@webxr-polyfill/vr-present-start', session.id);
        }

        return Promise.resolve(session.id);
    }

    /**
     * @return {Function}
     */
    requestAnimationFrame(callback) {
        var t_this = this;
        setTimeout(function () {
            if (t_this.provider == undefined) {
                return t_this.global.requestAnimationFrame(callback);
            } else if (g_frame_data_state == 1) {
                g_frame_data_state = 0;
                console.log("call callback " + g_frame_data_count);
                t_this.poseMatrix = mat4.clone(g_frame_data);

                if (g_controller_data) {
                    t_this.controllerCount = g_controller_data.count;
                    for (var i = 0; i < t_this.controllerCount; i++) {
                        t_this.controllerisTouching[i] = g_controller_data.data[i][0];
                        t_this.controllerisButtonDown[i] = g_controller_data.data[i][1];
                        t_this.controllerisButtonUp[i] = g_controller_data.data[i][2];
                        t_this.controllerRay[0] = g_controller_data.data[i][3];
                        t_this.controllerRay[1] = g_controller_data.data[i][4];
                        t_this.controllerRay[2] = g_controller_data.data[i][5];
                        t_this.controllerRay[3] = g_controller_data.data[i][6];
                        t_this.controllerRay[4] = g_controller_data.data[i][7];
                        t_this.controllerRay[5] = g_controller_data.data[i][8];
                        t_this.controllerRay[6] = g_controller_data.data[i][9];

                        console.log("call controllerisTouching " + t_this.controllerisTouching[i]);
                    }
                }
                callback();
            } else {
                t_this.requestAnimationFrame(callback);
            }
        }, 1);
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


        // TODO: 

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
        }
        // const aspect = width * (this.immersive ? 0.5 : 1.0) / height;
        this.updateFrameData(near, far);
        // TODO: connect input source
        this._updateGamepadState();

        this._debugout(renderState);

    }


    updateFrameData(near, far) {
        // setup view matrix
        mat4.invert(this.leftViewMatrix, mat4.multiply(this.leftViewMatrix, this.poseMatrix, this.eyeOffset.left));
        mat4.invert(this.rightViewMatrix, mat4.multiply(this.rightViewMatrix, this.poseMatrix, this.eyeOffset.right));

    }

    /**
     * @param {number} sessionId
     */
    onFrameEnd(sessionId) {
        // TODO:
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
        return undefined;
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
            return this.leftProjectionMatrix;
        } else if (eye === 'right') {
            return this.rightProjectionMatrix;
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
        // TODO:
        return this.poseMatrix;
    }

    /**
     * Get view matrix unaffected by frame of reference.
     *
     * @param {XREye} eye
     * @return {Float32Array}
     */
    getBaseViewMatrix(eye) {
        if (eye === 'left' || eye === 'none') {
            return this.leftViewMatrix;
        } else if (eye === 'right') {
            return this.rightViewMatrix;
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
        this.onWindowResize();
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
    // create gamepad
    _createGamepad (id, hand, buttonNum, hasPosition) {
        const buttons = [];
        for (let i = 0; i < buttonNum; i++) {
          buttons.push({
            pressed: false,
            touched: false,
            value: 0.0
          });
        }
        return {
          id: id || '',
          pose: {
            hasPosition: hasPosition,
            position: [0, 0, 0],
            orientation: [0, 0, 0, 1]
          },
          buttons: buttons,
          hand: hand,
          mapping: 'xr-standard',
          axes: [0, 0]
        };
      };


    _initializeControllers(controllerNum) {

        this.gamepads.length = 0;
        this.gamepadInputSources.length = 0;

        for (let i = 0; i < controllerNum; i++) {
            this.gamepads.push(createGamepad('NR Controller','right',3,true));
            const inputSourceImpl = new GamepadXRInputSource(this,{},0,1);
            inputSourceImpl.active = true;
            this.gamepadInputSources.push(inputSourceImpl);
        }
    }


    _updateGamepadState(){

        if(this.gamepads.length != g_controller_data.count){
            this._initializeControllers(g_controller_data.count);
        }

        for (let i = 0; i < this.gamepads.length;i++){
            const gamepad = this.gamepads[i];
            const touched = g_controller_data.data[i][0] === 1;
            const pressed = g_controller_data.data[i][1] === 1;
            gamepad.buttons[i].touched = touched;
            gamepad.buttons[i].pressed = pressed;
            gamepad.buttons[i].value = pressed?1.0:0.0; 
            
            gamepad.pose.position = g_controller_data.data[i].slice(3,6);
            gamepad.pose.orientation = g_controller_data.data[i].slice(6,10);

            const inputSourceImpl = this.gamepadInputSources[i];
            inputSourceImpl.updateFromGamepad(gamepad);


        if (inputSourceImpl.primaryButtonIndex !== -1) {
            const primaryActionPressed = gamepad.buttons[inputSourceImpl.primaryButtonIndex].pressed;
            if (primaryActionPressed && !inputSourceImpl.primaryActionPressed) {
              // Fire primary action select start event in onEndFrame() for AR device.
              // See the comment in onEndFrame() for the detail.
              if (this.arDevice) {
                inputSourceImpl.active = true;
              } else {
                this.dispatchEvent('@@webxr-polyfill/input-select-start', { sessionId: session.id, inputSource: inputSourceImpl.inputSource });
              }
            } else if (!primaryActionPressed && inputSourceImpl.primaryActionPressed) {
              if (this.arDevice) {
                inputSourceImpl.active = false;
              }
              this.dispatchEvent('@@webxr-polyfill/input-select-end', { sessionId: session.id, inputSource: inputSourceImpl.inputSource });
            }
            // imputSourceImpl.primaryActionPressed is updated in onFrameEnd().
          }
          if (inputSourceImpl.primarySqueezeButtonIndex !== -1) {
            const primarySqueezeActionPressed = gamepad.buttons[inputSourceImpl.primarySqueezeButtonIndex].pressed;
            if (primarySqueezeActionPressed && !inputSourceImpl.primarySqueezeActionPressed) {
              this.dispatchEvent('@@webxr-polyfill/input-squeeze-start', { sessionId: session.id, inputSource: inputSourceImpl.inputSource });
            } else if (!primarySqueezeActionPressed && inputSourceImpl.primarySqueezeActionPressed) {
              this.dispatchEvent('@@webxr-polyfill/input-squeeze-end', { sessionId: session.id, inputSource: inputSourceImpl.inputSource });
            }
            inputSourceImpl.primarySqueezeActionPressed = primarySqueezeActionPressed;
          }
        }
    }


    // Interfaces for Nreal SDK.
    getEyePoseFromHead(eye) {
        let eyeIndex = -1;

        if (eye === 'left' || eye === 'none') {
            eyeIndex = 0;
        } else if (eye === 'right') {
            eyeIndex = 1;
        }

        if (this.provider != null) {
            // matrix4 array 
            const data = JSON.parse(this.provider.getEyePoseFromHead(eyeIndex));
            return mat4.clone(data);
        }
        return mat4.identity(mat4.create());
    }

    getEyeFov(eye) {
        let eyeIndex = -1;
        if (eye === 'left' || eye === 'none') {
            eyeIndex = 0;
        } else if (eye === 'right') {
            eyeIndex = 1;
        }
        if (this.provider != null) {
            // float4 array, tangent values of the 
            var val = JSON.parse(this.provider.getEyeFov(eyeIndex));
            val[0] = -val[0];
            val[3] = -val[3];
            // sort to left,right,bottom,top
            const bottom = val[3];
            val[3] = val[2];
            val[2] = bottom;


            return val;
        }
        return [-1, 1, -1, 1];
    }

    _debugout(renderState) {
        if (!this.debugout) {
            return;
        }
        this.debugout = false;
        console.log('renderState=' + renderState);

        console.log('pose matrix=' + this.poseMatrix);
        console.log('projection matrix=' + this.leftProjectionMatrix);
        console.log('view matrix=' + this.leftViewMatrix);
    }
}

