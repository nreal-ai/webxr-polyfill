
export default class NRXRAnimationTimer {
    constructor() {
        this.expected_fps = 60;
        this.time_per_frame = 1000 / this.expected_fps;
        this.start_time = Date.now();
        this.last_animation_start_time = 0;
        this.duration_time_to_get_pose = 0;
        this.animation_handle = 1;
        this.cancel_animation_frame = false;

    }

    requestAnimationFrame(callback, updateFunc) {
        if (!updateFunc) {
            return window.requestAnimationFrame(callback);
        }


        var timeout = this.time_per_frame - this.duration_time_to_get_pose;

        setTimeout(() => {
            // if (this.cancel_animation_frame)
            //     return;
            this.animation_handle++;
            var before_getpose = Date.now();
            updateFunc();

            this.duration_time_to_get_pose = Date.now() - before_getpose;
            callback();
        }, timeout > 0 ? timeout : 0);

        return this.animation_handle;
    }

    cancelAnimationFrame(handle) {
        // if (this.nrBridge === undefined || !this.nrBridge) {
        this.cancel_animation_frame = true;
        return window.cancelAnimationFrame(handle);
        // }
    }

}