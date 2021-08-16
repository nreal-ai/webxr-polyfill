import { vec3, mat4, quat } from "gl-matrix/src/gl-matrix";

import GLOBAL from '../lib/global';

// {
//     "headpose": float[16],

//         "controller": {

//         "count": int,

//         "data": array[float[12]],
//     }

// }

var g_frame_data = "";
var g_frame_data_state = 0;
var g_frame_data_count = 0;
var g_controller_data = "";
function prepareForNextFrameAndCallback(frame_data) {
    var jsonObject = JSON.parse(frame_data);

    g_frame_data = jsonObject.headpose;
    g_controller_data = jsonObject.controller;

    g_frame_data_state = 1;
    g_frame_data_count++;
    return window.nrbridge.requestUpdate() ? 'Y' : 'N';
}


var Eye = {
    LEFT: 'left',
    RIGHT: 'right',
    NONE: 'none'
};
var startDate = Date.now();
var startPerfNow = performance.now();



export default class NrealBridge {

    constructor() {
        this.provider = window.nrprovider != undefined ? window.nrprovider : null;


        this.fieldOfView = {
            left: this._getEyeFov(Eye.LEFT),
            right: this._getEyeFov(Eye.RIGHT)
        }

        this.eyeOffset = {
            left: this._getEyePoseFromHead(Eye.LEFT),
            right: this._getEyePoseFromHead(Eye.RIGHT)
        }

        this.headPose = mat4.create();
        this.gamepads = [];
        this.armLength = 0.5;


        this.near = 0.01;
        this.far = 1000;

        this.leftViewMatrix = mat4.create();
        this.rightViewMatrix = mat4.create();

        this.leftProjectionMatrix = mat4.create();
        this.rightProjectionMatrix = mat4.create();

        this._initializeProjectionMatrix(this.leftProjectionMatrix,
            this.fieldOfView.left, this.near, this.far);
        this._initializeProjectionMatrix(this.rightProjectionMatrix,
            this.fieldOfView.right, this.near, this.far);


        this.animationCallback = null;


        window.prepareForNextFrameAndCallback = prepareForNextFrameAndCallback;

        this.touchStartEuler = vec3.create();
        this.touchstartQuat = quat.create();
        this.firstTouch = false;

    }

    _initializeProjectionMatrix(out, fov, near, far) {
        mat4.frustum(out, fov[0] * near, fov[1] * near, fov[2] * near, fov[3] * near, near, far);
    }


    startSession() {
        this.provider.StartXR();
    }

    endSession() {
        this.provider.ExitXR();
    }
    needUpdate() {
        if (this.provider === undefined && g_frame_data_state === 0) {
            return false;
        } else {
            return true;
        }
    }



    requestUpdate() {
        if (this.animationCallback === null) {
            return false;
        }
        this.headPose = mat4.clone(g_frame_data);
        mat4.invert(this.leftViewMatrix, mat4.multiply(this.leftViewMatrix, this.headPose, this.eyeOffset.left));
        mat4.invert(this.rightViewMatrix, mat4.multiply(this.rightViewMatrix, this.headPose, this.eyeOffset.right));
        if (this.gamepads.length != g_controller_data.count) {
            this._initializeControllers(g_controller_data.count);
        }

        for (let i = 0; i < this.gamepads.length; i++) {
            let gamepad = this.gamepads[i];
            gamepad.timestamp = startDate + (performance.now() - startPerfNow);
            let data = g_controller_data.data[i];
            let touched = data[0] === 1;
            let pressed = data[1] === 1;

            let axes0 = data[10];
            let axes1 = data[11];



            if (touched && Math.abs(gamepad.axes[1]) > 0.01) {
                let offset = axes1 - gamepad.axes[1];
                this.armLength += offset;
                this.armLength = Math.max(0.01, Math.min(0.75, this.armLength));
            }

            for (let j = 0; j < gamepad.buttons.length; j++) {
                gamepad.buttons[j].touched = false;
                gamepad.buttons[j].pressed = false;
                gamepad.buttons[j].value = 0;
            }

            let position = data.slice(3, 6);
            let orientation = data.slice(6, 10);

            if (axes0 > 0.5) {
                gamepad.buttons[0].touched = touched;
                gamepad.buttons[0].pressed = pressed;
                gamepad.buttons[0].value = pressed ? 1.0 : 0.0;
                gamepad.buttons[1].touched = touched;
                gamepad.buttons[1].pressed = pressed;
                gamepad.buttons[1].value = pressed ? 1.0 : 0.0;
                gamepad.buttons[3].touched = touched;
                gamepad.buttons[3].pressed = pressed;
                gamepad.buttons[3].value = pressed ? 1.0 : 0.0;
            }

            let arm = vec3.fromValues(0, 0, -this.armLength);
            vec3.transformQuat(arm, arm, orientation);
            vec3.add(gamepad.pose.position, position, arm);


            let handOri = quat.clone(orientation);
            if (touched) {
                if (!this.firstTouch) {
                    this.firstTouch = true;
                    this.touchstartQuat = quat.clone(orientation);
                    this._getEuler(this.touchStartEuler, orientation);
                }

                let curEuler = vec3.create();
                this._getEuler(curEuler, orientation);
                
                let newEuler = vec3.create();
                newEuler[0] = this.touchStartEuler[0] + (curEuler[0] -  this.touchStartEuler[0])*2;
                newEuler[1] = this.touchStartEuler[1] + (curEuler[1] -  this.touchStartEuler[1])*2;
                newEuler[2] = curEuler[2] ;

                
                const order = 'yxz';
                let  temp = quat.create();
                this._fromEuler(temp,newEuler[0],newEuler[1],newEuler[2],order);
                handOri[0] = temp[3];
                handOri[1] = temp[2];
                handOri[2] = temp[0];
                handOri[3] = temp[1];


            } else {
                this.firstTouch = false;
            }


            gamepad.pose.orientation = handOri;
            gamepad.axes = [axes0, axes1];
        }
        this.animationCallback();
        return true;
    }


    /**
     * Returns an euler angle representation of a quaternion
     * @param  {vec3} out Euler angles, pitch-yaw-roll
     * @param  {quat} mat Quaternion
     * @return {vec3} out
     */
    _getEuler(out, quat) {
        let x = quat[0],
            y = quat[1],
            z = quat[2],
            w = quat[3],
            x2 = x * x,
            y2 = y * y,
            z2 = z * z,
            w2 = w * w;
        let unit = x2 + y2 + z2 + w2;
        let test = x * w - y * z;
        if (test > 0.499995 * unit) { //TODO: Use glmatrix.EPSILON
            // singularity at the north pole
            out[0] = Math.PI / 2;
            out[1] = 2 * Math.atan2(y, x);
            out[2] = 0;
        } else if (test < -0.499995 * unit) { //TODO: Use glmatrix.EPSILON
            // singularity at the south pole
            out[0] = -Math.PI / 2;
            out[1] = 2 * Math.atan2(y, x);
            out[2] = 0;
        } else {
            out[0] = Math.asin(2 * (x * z - w * y));
            out[1] = Math.atan2(2 * (x * w + y * z), 1 - 2 * (z2 + w2));
            out[2] = Math.atan2(2 * (x * y + z * w), 1 - 2 * (y2 + z2));
        }
        // TODO: Return them as degrees and not as radians

        let toDegree = 180/ Math.PI;


        out[0] *= toDegree
        out[1] *= toDegree
        out[2] *= toDegree
        return out;
    }


    /**
     * Creates a quaternion from the given euler angle x, y, z using the provided intrinsic order for the conversion.
     *
     * @param {quat} out the receiving quaternion
     * @param {x} x Angle to rotate around X axis in degrees.
     * @param {y} y Angle to rotate around Y axis in degrees.
     * @param {z} z Angle to rotate around Z axis in degrees.
     * @param {'zyx'|'xyz'|'yxz'|'yzx'|'zxy'|'zyx'} order Intrinsic order for conversion, default is zyx.
     * @returns {quat} out
     * @function
     */
    _fromEuler(out, x, y, z, order = 'xyz') {
    let halfToRad = Math.PI / 360;
    x *= halfToRad;
    z *= halfToRad;
    y *= halfToRad;
  
    let sx = Math.sin(x);
    let cx = Math.cos(x);
    let sy = Math.sin(y);
    let cy = Math.cos(y);
    let sz = Math.sin(z);
    let cz = Math.cos(z);
  
    switch (order) {
      case "xyz":
        out[0] = sx * cy * cz + cx * sy * sz;
        out[1] = cx * sy * cz - sx * cy * sz;
        out[2] = cx * cy * sz + sx * sy * cz;
        out[3] = cx * cy * cz - sx * sy * sz;
        break;
  
      case "xzy":
        out[0] = sx * cy * cz - cx * sy * sz;
        out[1] = cx * sy * cz - sx * cy * sz;
        out[2] = cx * cy * sz + sx * sy * cz;
        out[3] = cx * cy * cz + sx * sy * sz;
        break;
  
      case "yxz":
        out[0] = sx * cy * cz + cx * sy * sz;
        out[1] = cx * sy * cz - sx * cy * sz;
        out[2] = cx * cy * sz - sx * sy * cz;
        out[3] = cx * cy * cz + sx * sy * sz;
        break;
  
      case "yzx":
        out[0] = sx * cy * cz + cx * sy * sz;
        out[1] = cx * sy * cz + sx * cy * sz;
        out[2] = cx * cy * sz - sx * sy * cz;
        out[3] = cx * cy * cz - sx * sy * sz;
        break;
  
      case "zxy":
        out[0] = sx * cy * cz - cx * sy * sz;
        out[1] = cx * sy * cz + sx * cy * sz;
        out[2] = cx * cy * sz + sx * sy * cz;
        out[3] = cx * cy * cz - sx * sy * sz;
        break;
  
      case "zyx":
        out[0] = sx * cy * cz - cx * sy * sz;
        out[1] = cx * sy * cz + sx * cy * sz;
        out[2] = cx * cy * sz - sx * sy * cz;
        out[3] = cx * cy * cz + sx * sy * sz;
        break;
  
      default:
        throw new Error('Unknown angle order ' + order);
    }
  
    return out;
  }


    _initializeControllers(controllerNum) {
        this.gamepads.length = 0;
        for (let i = 0; i < controllerNum; i++) {
            // FIXME: dual hands support
            this.gamepads.push(this._createGamepad('oculus-touch', 'right', 7, true));
        }
    }

    // create gamepad
    _createGamepad(id, hand, buttonNum, hasPosition) {
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
            axes: [0, 0, 0, 0],
            timestamp: startDate + (performance.now() - startPerfNow)
        };
    };


    // Interfaces for Nreal SDK.
    _getEyePoseFromHead(eye) {
        let eyeIndex = -1;

        if (eye === Eye.LEFT || eye === Eye.NONE) {
            eyeIndex = 0;
        } else if (eye === Eye.RIGHT) {
            eyeIndex = 1;
        }

        if (this.provider != null) {
            // matrix4 array 
            const data = JSON.parse(this.provider.getEyePoseFromHead(eyeIndex));
            return mat4.clone(data);
        }
        return mat4.identity(mat4.create());
    }

    _getEyeFov(eye) {
        let eyeIndex = -1;
        if (eye === Eye.LEFT || eye === Eye.NONE) {
            eyeIndex = 0;
        } else if (eye === Eye.RIGHT) {
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


    // for webvr dataset

    updateVrEyeParameters(parameters, eye) {
        const toDegree = 180 / Math.PI;
        const count = 4;
        let degrees = new Float32Array(count);
        let isLeft = eye === Eye.left;
        let fov = isLeft ? this.fieldOfView.left : this.fieldOfView.right;
        for (let i = 0; i < count; i++) {
            degrees[i] = Math.abs(Math.atan(fov[i]) * toDegree);
        }

        parameters.fieldOfView.leftDegrees = degrees[0];
        parameters.fieldOfView.rightDegrees = degrees[1];
        parameters.fieldOfView.downDegrees = degrees[2];
        parameters.fieldOfView.upDegrees = degrees[3];

        mat4.getTranslation(parameters.offset, isLeft ? this.eyeOffset.left : this.eyeOffset.right);
    }


    updateVrPose(pose) {
        mat4.getTranslation(pose.position, this.headPose);
        mat4.getRotation(pose.orientation, this.headPose);
    }


    updateVrFrameData(frameData) {
        frameData.leftProjectionMatrix = this.leftProjectionMatrix;
        frameData.leftViewMatrix = this.leftViewMatrix;
        frameData.rightProjectionMatrix = this.rightProjectionMatrix;
        frameData.rightViewMatrix = this.rightViewMatrix;
        frameData.pose = this.headPose;

        return true;
    }
}


var Bridge;
(
    function () {
        var instance;
        Bridge = function Bridge() {
            if (instance) {
                return instance;
            }
            instance = new NrealBridge();
        }
    }()
);