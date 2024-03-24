var app = new Vue({
    el: '#app',
    // storing the state of the page
    data: {
        connected: false,
        ros: null,
        logs: [],
        loading: false,
        topic: null,
        message: null,
        rosbridge_address: 'wss://i-00436614ffb7af27b.robotigniteacademy.com/eb664f6c-14ab-4c25-861a-0d305529f7a2/rosbridge/',
        port: '9090',
        // dragging data
        dragging: false,
        x: 'no',
        y: 'no',
        dragCircleStyle: {
            margin: '0px',
            top: '0px',
            left: '0px',
            display: 'none',
            width: '75px',
            height: '75px',
        },
        // joystick valules
        joystick: {
            vertical: 0,
            horizontal: 0,
        },
        // publisher
        pubInterval: null,
        // 3D stuff
        viewer: null,
        tfClient: null,
        urdfClient: null,
        // Map stuff
        mapViewer: null,
        mapGridClient: null,
        interval: null,
        //Action stuff
        goal: null,
        action: {
            goal: { position: { x: 0, y: 0, z: 0 } },
            feedback: {  position: { x: 0, y: 0, z: 0 },state: ''},
            result: { success:  false   },
        status: { 
            text: '' 
        },
    },
    },
    // helper methods to connect to ROS
    methods: {
        connect: function() {
            this.loading = true
            this.ros = new ROSLIB.Ros({
                url: this.rosbridge_address
            })
            this.ros.on('connection', () => {
                this.logs.unshift((new Date()).toTimeString() + ' - Connected!')
                this.connected = true
                this.loading = false
                this.setup3DViewer()
                this.setCamera()
                this.setupMap()
            })
            this.ros.on('error', (error) => {
                this.logs.unshift((new Date()).toTimeString() + ` - Error: ${error}`)
            })
            this.ros.on('close', () => {
                this.logs.unshift((new Date()).toTimeString() + ' - Disconnected!')
                this.connected = false
                this.loading = false
                this.unsetViewers()
               
            })
        },
        publish: function() {
            let topic = new ROSLIB.Topic({
                ros: this.ros,
                name: '/cmd_vel',
                messageType: 'geometry_msgs/Twist'
            })
            let message = new ROSLIB.Message({
                linear: { x: this.joystick.vertical, y: 0, z: 0, },
                angular: { x: 0, y: 0, z: this.joystick.horizontal, },
            })
            topic.publish(message)
        },

        disconnect: function() {
            this.ros.close()
            this.goal = null
        },

        setCamera: function() {
            let without_wss = this.rosbridge_address.split('wss://')[1]
            console.log(without_wss)
            let domain = without_wss.split('/')[0] + '/' + without_wss.split('/')[1]
            console.log(domain)
            let host = domain + '/cameras'
            let viewer = new MJPEGCANVAS.Viewer({
                divID: 'divCamera',
                host: host,
                width: 320,
                height: 320,
                topic: '/camera/image_raw',
                ssl: true,
            })
        },

        setupMap() {
            this.mapViewer = new ROS2D.Viewer({
                divID: 'map',
                width: 420,
                height: 320
            })
        // Setup the map client.
            this.mapGridClient = new ROS2D.OccupancyGridClient({
                ros: this.ros,
                rootObject: this.mapViewer.scene,
                continuous: true,
            })
        // Scale the canvas to fit to the map
            this.mapGridClient.on('change', () => {
                const zoomFactor = 1/4;
                this.mapViewer.scaleToDimensions(this.mapGridClient.currentGrid.width*zoomFactor, this.mapGridClient.currentGrid.height*zoomFactor);
                this.mapViewer.shift(this.mapGridClient.currentGrid.pose.position.x*zoomFactor, this.mapGridClient.currentGrid.pose.position.y*zoomFactor)
            })
        },

        setup3DViewer() {
            this.viewer = new ROS3D.Viewer({
                background: '#cccccc',
                divID: 'div3DViewer',
                width: 320,
                height: 320,
                antialias: true,
                fixedFrame: 'odom'
            })

            // Add a grid.
            this.viewer.addObject(new ROS3D.Grid({
                color:'#0181c4',
                cellSize: 0.5,
                num_cells: 20
            }))

            // Setup a client to listen to TFs.
            this.tfClient = new ROSLIB.TFClient({
                ros: this.ros,
                angularThres: 0.01,
                transThres: 0.01,
                rate: 10.0
            })

            // Setup the URDF client.
            this.urdfClient = new ROS3D.UrdfClient({
                ros: this.ros,
                param: 'robot_description',
                tfClient: this.tfClient,
                // We use "path: location.origin + location.pathname"
                // instead of "path: window.location.href" to remove query params,
                // otherwise the assets fail to load
                path: location.origin + location.pathname,
                rootObject: this.viewer.scene,
                loader: ROS3D.COLLADA_LOADER_2
            })
        },
        unsetViewers() {
            document.getElementById('div3DViewer').innerHTML = ''
            document.getElementById('divCamera').innerHTML = ''
            document.getElementById('map').innerHTML = ''

        },

        sendCommand: function() {
            let topic = new ROSLIB.Topic({
                ros: this.ros,
                name: '/cmd_vel',
                messageType: 'geometry_msgs/Twist'
            })
            let message = new ROSLIB.Message({
                linear: { x: this.joystick.vertical, y: 0, z: 0, },
                angular: { x: 0, y: 0, z: this.joystick.horizontal },
            })
            topic.publish(message)
        },
        startDrag() {
            this.dragging = true;
            let ref = document.getElementById('dragstartzone');
            let circleCenterX = ref.offsetLeft + ref.offsetWidth / 2;
            let circleCenterY = ref.offsetTop + ref.offsetHeight / 2;
            this.x = circleCenterX;
            this.y = circleCenterY;
            this.dragCircleStyle.display = 'inline-block';
            this.dragCircleStyle.left = `${this.x - parseInt(this.dragCircleStyle.width) / 2}px`;
            this.dragCircleStyle.top = `${this.y - parseInt(this.dragCircleStyle.height) / 2}px`;
        },
        stopDrag() {
            this.dragging = false
            this.x = this.y = 'no'
            this.dragCircleStyle.display = 'none'
            this.resetJoystickVals()
            this.publish();
        },
        doDrag(event) {
            if (this.dragging) {
                this.x = event.offsetX
                this.y = event.offsetY
                let ref = document.getElementById('dragstartzone')
                this.dragCircleStyle.display = 'inline-block'

                let minTop = ref.offsetTop - parseInt(this.dragCircleStyle.height) / 2
                let maxTop = minTop + 200
                let top = this.y + minTop
                this.dragCircleStyle.top = `${top}px`

                let minLeft = ref.offsetLeft - parseInt(this.dragCircleStyle.width) / 2
                let maxLeft = minLeft + 200
                let left = this.x + minLeft
                this.dragCircleStyle.left = `${left}px`

                this.setJoystickVals()
                this.publish();
            }
        },
        setJoystickVals() {
            this.joystick.vertical = -0.4 * ((this.y / 200) - 0.5)
            this.joystick.horizontal = -1.0 * ((this.x / 200) - 0.5)
        },
        resetJoystickVals() {
            this.joystick.vertical = 0
            this.joystick.horizontal = 0
        },
        sendGoal: function() {
            let actionClient = new ROSLIB.ActionClient({
                ros : this.ros,
                serverName : '/tortoisebot_as',
                actionName : 'course_web_dev_ros/action/WaypointActionAction'
            })

            this.goal = new ROSLIB.Goal({
                actionClient : actionClient,
                goalMessage: {
                    ...this.action.goal
                }
            })

            this.goal.on('status', (status) => {
                this.action.status = status
            })

            this.goal.on('feedback', (feedback) => {
                this.action.feedback.position = { ...feedback.feedback.position };
                this.action.feedback.state = feedback.feedback.state;
            });


        this.goal.on('result', (result) => {
            this.action.result.success = result.result.success;
            this.$forceUpdate(); // Force Vue to re-render the component
             });
            this.goal.send()
        },
        cancelGoal: function() {
            this.goal.cancel()
        },

        
        sendPreconfiguredGoal(goalNumber) {
        // Define preconfigured goals
        const goals = {
            1: {x: 0.65, y: -0.43},
            2: {x: 0.65, y: 0.43},
            3: {x: 0.25, y: 0.43},
            4: {x: 0.25, y: 0.0},
            5: {x: -0.11, y: 0.0},
            6: {x: -0.11, y: -0.43},
            7: {x: -0.43, y: -0.43},
            8: {x: -0.11, y: 0.43},
            9: {x: -0.53, y: 0.43},
        };

        // Get the selected goal based on button pressed
        const selectedGoal = goals[goalNumber];

        // Assuming you have a method or setup to send a goal
        // For example, updating the goal part of your data and then calling sendGoal
        this.action.goal.position.x = selectedGoal.x;
        this.action.goal.position.y = selectedGoal.y;

        // Now, call the method to send the goal
        // This could be your existing method to send a goal to the action server
        this.sendGoal();
    },





    },
    mounted() {
    window.addEventListener('mouseup', this.stopDrag)
    this.interval = setInterval(() => {
        if (this.ros != null && this.ros.isConnected) {
            this.ros.getNodes((data) => { }, (error) => { })
        }
    }, 10000)
    },
})