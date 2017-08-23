const router = require("express").Router();
const async = require("async");
const fs = require("fs");
const crypto = require('crypto');

const User = require("../../models/user");
const Marker = require("../../models/marker");

let saveImage = (newImage, oldImage, done) => {
    let decodeBase64Image = (dataString) => {
        const matches = dataString.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        let response = {};

        if (matches.length !== 3) return new Error('Invalid input string');

        response.type = matches[1];
        response.data = new Buffer(matches[2], 'base64');

        return response;
    };

    if(oldImage){
        let filePath = './resources' + oldImage;
        try {
            fs.unlinkSync(filePath);
        } catch (err) {
            done(err, null);
            return;
        }
    }

    if(!newImage){
        done(null, null);
        return;
    }

    let imageBuffer = decodeBase64Image(newImage);

    if(imageBuffer.name){
        done(imageBuffer, null);
        return;
    }

    let userImgLocation = 'resources/uploads/img/users/';
    let uniqueImgName = 'image-' + crypto.createHash('sha1').update(crypto.randomBytes(20)).digest('hex');

    let imageTypeDetected = imageBuffer.type.match(/\/(.*?)$/);
    var serverPath  = userImgLocation + uniqueImgName + '.' + imageTypeDetected[1];
    var clientPath  = '/uploads/img/users/' + uniqueImgName + '.' + imageTypeDetected[1];

    fs.writeFile(serverPath, imageBuffer.data, 'base64', (err) =>{
        if(err){
            done(err, null);
            return;
        }
        console.log('DEBUG - feed:message: Saved to disk image attached by user:', serverPath);
        done(null, clientPath);
    });
};


router.get("/user/:id", (req, res) => {

    let id = (req.params.id === 'undefined') ? req.user._id : req.params.id;

    async.waterfall([
        (done) => {
            User.findOne({ _id: id }, {}, (err, user) => {
                if(err){
                    done(err, null);
                    return;
                }

                if (!user) {
                    done({status: false, message: "No user found."}, null);
                    return;
                }
                done(err, user);
            })
        },
        (user, done) => {
            Marker.find( {owner: user._id}, (err, markers) => {
                if(err){
                    done(err, null);
                    return;
                }

                user.markers = markers;
                done(err, user);
            })
        }
    ], (err, user) => {

        if (err) {
            if( err.message ){
                return res.json(err);
            } else {
                throw err;
            }
        }

        res.json({
            status: true,
            res: user
        });
    });

});

//update user
router.put("/user", (req, res) => {

    async.waterfall([
        (done) => {
            User.findOne({ _id: req.body._id }, {}, (err, user) => {

                if (err) {
                    done({status: false, message: "Undefined error, no user found."}, null);
                    return;
                }

                if (!user) {
                    done({status: false, message: "No user found."}, null);
                    return;
                }

                //if password was changed
                if(req.body.oldPassword) {
                    if (!user.comparePassword(req.body.oldPassword)) {
                        done({status: false, message: "Oops! Wrong password."}, null);
                        return;
                    }
                    user.password = req.body.password;

                    user.save((err) => {
                        if (err) {
                            done(err, null);
                            return;
                        }
                        done({status: true, message: "Password successfully was changed."}, null);
                        return;
                    });
                } else if (req.body.email !== user.email){
                    //if email was changed
                    User.findOne({ email: req.body.email }, function (err, result) {
                        if(err){
                            done(err, null);
                            return;
                        }

                        if (result) {
                            done({status: false, email: true, message: "That email is already taken."}, null);
                            return;
                        }
                        user.email = req.body.email;

                        done(null, user);
                    });
                } else {
                    done(null, user);
                }

            });

        },
        (user, done) => {
            user.firstName = req.body.firstName || user.firstName;
            user.secondName = req.body.secondName || user.secondName;

            if(req.body.avatar !== user.avatar){
                saveImage(req.body.img, user.img, (err, img) => {
                    user.img = img;
                    done(err,user);
                })
            } else {
                done(null, user);
            }
        }

    ], (err, resUser) => {
        if(err){
            if(err.message){
                return res.json(err);
            } else {
                throw err;
            }
        }

        resUser.save( (err, user) => {
            if (err) throw err;
            return res.json({
                status: true,
                res: user,
                message: "User successfully was changed."
            })
        });
    });
});

//create user
router.post("/user", (req, res) => {
    if (!req.body.email || !req.body.password || !req.body.firstName) {
        return res.json({
            status: false,
            message: "Empty fields."
        });
    }

    async.waterfall([
        (done) => {
            User.findOne({ email: req.body.email }, (err, user) => {
                if(err){
                    done(err, null);
                    return;
                }

                if (user) {
                    done({status: false, email: true, message: "Email is already taken."}, null);
                    return;
                }

                let newUser = new User({
                    email: req.body.email,
                    password: req.body.password,
                    firstName: req.body.firstName,
                    secondName: req.body.secondName || '',
                    img: req.body.img || null
                });

                done(null, newUser);
            });
        },
        (newUser, done) => {
            //adding image
            if(newUser.img){
                saveImage(newUser.img, null, (err, img) => {
                    newUser.img = img;
                    done(err, newUser);
                })
            } else {
                done(null, newUser);
            }
        }
    ],   (err, user) => {

        if (err) {
            if( err.message ){
                return res.json(err);
            } else {
                throw err;
            }
        }

        user.save( (err, user) => {
            if (err) throw err;

            return res.json({
                status: true,
                res: user,
                message: "User was successfully created."
            })
        });

    });

});

//delete user
router.delete("/user", (req, res) => {
    User.findOne({ _id: req.body._id }, (err, user) => {
        if (err) throw err;

        if (!user) {
            return res.json({
                status: false,
                message: "No user found"
            });
        }
    }).remove().exec(function (err) {
        if (err) throw err;

        res.json({
            status: true,
            message: "User was successfully deleted"
        });
    });
});

module.exports = router;