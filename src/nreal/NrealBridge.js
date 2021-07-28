import { mat4 } from "gl-matrix/src/gl-matrix";

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
function prepareForNextFrame(frame_data) {

    var jsonObject = JSON.parse(frame_data);

    g_frame_data = jsonObject.headpose;
    g_controller_data = jsonObject.controller;

    g_frame_data_state = 1;
    g_frame_data_count++;
}


var Eye = {
    LEFT: 'left',
    RIGHT: 'right',
    NONE: 'none'
};

export default class NrealBridge {

    constructor(global) {
        this.global = global;
        this.provider = window.nrprovider != undefined ? window.nrprovider : null;
        this.fieldOfView = {
            left: this._getEyeFov(Eye.LEFT),
            right: this._getEyeFov(Eye.RIGHT)
        }

        this.eyeOffset = {
            left: this._getEyePoseFromHead(Eye.LEFT),
            right: this._getEyePoseFromHead(Eye.RIGHT)
        }

        this.poseMatrix = mat4.create();
        this.gamepads = [];
        this.armLenght = 0.5;
        this.global.prepareForNextFrame = prepareForNextFrame;


        this.near = 0.01;
        this.far = 1000;

        this.leftViewMatrix = mat4.create();
        this.rightViewMatrix = mat4.create();

        this.leftProjectionMatrix = mat4.create();
        this.rightProjectionMatrix = mat4.create();

        this._initializeProjectionMatrix(this.leftProjectionMatrix,
            this.fieldOfView.left,this.near,this.far);
        this._initializeProjectionMatrix(this.rightProjectionMatrix,
            this.fieldOfView.right,this.near,this.far);
    }

    _initializeProjectionMatrix(out, fov,near,far){
        mat4.frustum(out, fov[0] * near, fov[1] * near, fov[2] * near, fov[3] * near, near, far);
    }

    requestUpdate() {
        if (this.provider === undefined) {
            return 0;
        }
        if (g_frame_data_state != 1) {
            return -1;
        }

        g_frame_data_state = 0;
        this.poseMatrix = mat4.clone(g_frame_data);

        // setup view matrix
        mat4.invert(this.leftViewMatrix, mat4.multiply(this.leftViewMatrix, this.poseMatrix, this.eyeOffset.left));
        mat4.invert(this.rightViewMatrix, mat4.multiply(this.rightViewMatrix, this.poseMatrix, this.eyeOffset.right));


        if (this.gamepads.length != g_controller_data.count) {
            this._initializeControllers(g_controller_data.count);
        }

        for (let i = 0; i < this.gamepads.length; i++) {
            let gamepad = this.gamepads[i];
            let data = g_controller_data.data[i];
            let touched = data[0] === 1;
            let pressed = data[1] === 1;

            if (touched && Math.abs(gamepad.axes[1]) > 0.01) {
                let offset = data[11] - gamepad.axes[1];
                this.armLength += offset;
                this.armLength = Math.max(0.1, Math.min(2, this.armLength));
            }

            gamepad.buttons[i].touched = touched;
            gamepad.buttons[i].pressed = pressed;
            gamepad.buttons[i].value = pressed ? 1.0 : 0.0;

            gamepad.pose.position = data.slice(3, 6);
            gamepad.pose.orientation = data.slice(6, 10);
            gamepad.axes = [data[10], data[11]]

            let arm = vec3.fromValues(0, 0, -this.armLength);
            vec3.transformQuat(arm, arm, gamepad.pose.orientation);
            vec3.add(gamepad.pose.position, gamepad.pose.position, arm);
        }

        return 1;
    }



    _initializeControllers(controllerNum) {
        this.gamepads.length = 0;
        this.gamepadInputSources.length = 0;

        for (let i = 0; i < controllerNum; i++) {
            // FIXME: dual hands support
            this.gamepads.push(this._createGamepad('NR Controller', 'right', 3, true));
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
            axes: [0, 0]
        };
    };

    // for webxr call
    updateViewMatrix(){
        mat4.invert(this.leftViewMatrix, mat4.multiply(this.leftViewMatrix, this.poseMatrix, this.eyeOffset.left));
        mat4.invert(this.rightViewMatrix, mat4.multiply(this.rightViewMatrix, this.poseMatrix, this.eyeOffset.right));
    }





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
}
