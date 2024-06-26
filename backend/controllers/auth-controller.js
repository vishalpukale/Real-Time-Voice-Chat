const otpService = require('../services/otp-service');
const hashService = require('../services/hash-service');
const userService = require('../services/user-service');
const tokenService = require('../services/token-service');
const UserDto = require('../dtos/user-dto');


class AuthController {
    async sendOtp(req, res) {
        //logic
        const { phone } = req.body;
        if (!phone) {
            res.status(400).json({ message: "Phone Field is required" })
        }

        //4 digit random number
        const otp = await otpService.generateOtp();

        // hash
        const ttl = 1000 * 60 * 2; // 2min time for otp valid
        const expires = Date.now() + ttl;
        const data = `${phone}.${otp}.${expires}`;

        const hash = hashService.hashOtp(data);

        //send otp
        try {
            // await otpService.sendBySms(phone, otp);
            res.json({
                hash: `${hash}.${expires}`,
                phone,
                otp
            })
        }
        catch (e) {
            console.log(e);
            res.status(500).json({ message: "message sending failed" });
        }
    }


    async verifyOtp(req, res) {
        // logic
        const { otp, hash, phone } = req.body;
        if (!otp || !hash || !phone) {
            res.status(400).json({ message: "All fields required" })
        }

        const [hashedOtp, expires] = hash.split('.');

        if (Date.now() > +expires) {
            res.status(400).json({ message: "Otp Expired" });
        }

        const data = `${phone}.${otp}.${expires}`;
        const isValid = otpService.verifyOtp(hashedOtp, data);

        if (!isValid) {
            res.status(400).json({ message: "Invalid Otp" });
        }

        try {
            let user = await userService.findUser({ phone });
            if (!user) {
                user = await userService.createUser({ phone });
            }

            // Generate JWT Tokens
            const { accessToken, refreshToken } = tokenService.generateTokens({ _id: user._id, activated: false });


            await tokenService.storeRefreshToken(refreshToken, user._id);

            // Set Refresh Token as a Cookie
            res.cookie('refreshToken', refreshToken, {
                maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
                httpOnly: true
            });


            res.cookie('accessToken', accessToken, {
                maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
                httpOnly: true
            });


            // Send Access Token in the Response
            const userDto = new UserDto(user);

            return res.json({ user: userDto, auth: true });

        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Db error" });
        }
    }


    async refresh(req, res) {
        // get refresh token from cookie
        const { refreshToken: refreshTokenFromCookie } = req.cookies;
        // check if token is valid
        let userData;
        try {
            userData = await tokenService.verifyRefreshToken(refreshTokenFromCookie);
        } catch (err) {
            return res.status(401).json({ message: 'Invalid Token' });
        }
        // Check if token is in db
        let token;
        try {
            token = await tokenService.findRefreshToken(userData._id, refreshTokenFromCookie);
            if (!token) {
                return res.status(401).json({ message: 'Invalid token' });
            }
        } catch (err) {
            console.error(err);
            return res.status(500).json({ message: 'Internal error' });
        }
        // check if valid user
        let user;
        try {
            user = await userService.findUser({ _id: userData._id });
            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Internal error' });
        }
        // Generate new tokens
        const { refreshToken, accessToken } = tokenService.generateTokens({
            _id: userData._id,
        });
        // Update refresh token
        try {
            await tokenService.updateRefreshToken(userData._id, refreshToken);
        } catch (err) {
            console.error(err);
            return res.status(500).json({ message: 'Internal error' });
        }
        // put in cookie
        res.cookie('refreshToken', refreshToken, {
            maxAge: 1000 * 60 * 60 * 24 * 30,
            httpOnly: true,
        });
        res.cookie('accessToken', accessToken, {
            maxAge: 1000 * 60 * 60 * 24 * 30,
            httpOnly: true,
        });
        // response
        const userDto = new UserDto(user);
        res.json({ user: userDto, auth: true });
    }


    async logout(req, res){
        const { refreshToken } = req.cookies;
        // delete refresh token from db
        await tokenService.removeToken(refreshToken);
        // delete cookies
       res.clearCookie('refreshToken');
       res.clearCookie('accessToken');
       res.json({user: null, auth: false});
    }
}


module.exports = new AuthController();