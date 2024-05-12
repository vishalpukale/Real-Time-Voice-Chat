// /// <reference types="node" />
const Jimp = require("jimp");
const path = require("path");
const userService = require("../services/user-service");
const UserDto = require("../dtos/user-dto");

class ActivateController {
    async activate(req, res) {
        try {
            const { name, avatar } = req.body;
            if (!name || !avatar) {
                return res.status(400).json({ message: "All fields are required" });
            }

            const buffer = Buffer.from(
                avatar.replace(/^data:image\/(png|jpg|jpeg);base64,/, ""),
                "base64"
            );

            const imagePath = `${Date.now()}-${Math.round(Math.random() * 1e9)}.png`;

            try {
                const jimpResp = await Jimp.read(buffer);
                await jimpResp.resize(150, Jimp.AUTO).writeAsync(path.resolve(__dirname, `../storage/${imagePath}`));
            } catch (error) {
                console.error("Error processing image:", error);
                return res.status(500).json({ message: "Couldn't process image" });
            }

            const userId = req.user._id;
            // update user
            try {
                const user = await userService.findUser({ _id: userId });
                if (!user) {
                    return res.status(404).json({ message: "User not found" });
                }
                user.activated = true;
                user.name = name;
                user.avatar = `/storage/${imagePath}`;
                await user.save();
                return res.json({ user: new UserDto(user), auth: true });
            } catch (error) {
                console.error("Error updating user:", error);
                return res.status(500).json({ message: "Something went wrong" });
            }
        } catch (error) {
            console.error("Error activating:", error);
            return res.status(500).json({ message: "Internal Server Error" });
        }
    }
}

module.exports = new ActivateController();

