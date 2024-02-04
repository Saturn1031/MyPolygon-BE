const User = require('../models/user');
const Polygon = require('../models/polygon');
const Element = require('../models/element');
const PolygonElement = require('../models/polygon_element');
const { Op } = require('sequelize'); 
const auth = require('../middleware/auth');

const express = require('express');
const router = express.Router();

// 요소 설정 
router.post('/set-element', auth,  async (req, res) => {
    try {
        const { elements } = req.body; 
        const user = req.user;

        // 사용자와 프론트로부터 받은 요소 연결
        await user.addElements(elements);

        res.status(200).json({ success: true, message: `${user.nickname}님이 선택하신 요소 연결 성공` });
        
    } catch (error) {
        res.status(500).json({  success: false, message: `서버 오류 발생 ${error.message }` });
    }
})

// 요소 수정 -> 필요하다면 
router.put('/update-element', auth, async (req, res) => {
    try {
        const { elements } = req.body; 
        const user = req.user;

        // 사용자가 연결된 요소 끊음 
        await user.setElements([]);
        // 새로운 요소 연결
        await user.addElements(elements);

        res.status(200).json({ success: true, message: `${user.nickname}님이 선택하신 요소 업데이트 성공` });
        
    } catch (error) {
        res.status(500).json({ success: false, message: `서버 오류 발생 ${error.message}` });
    }
});


// 다각형 생성 
router.post('/create', auth, async (req, res) => {
    try{
        const reqScores = req.body;
        const user = req.user;

        const UserElements = await user.getElements();
        // 현재 날짜를 가진 다각형 생성 
        const createPolygon = await Polygon.create({ date: new Date(), grade: 0 });
        
        const perfectScore = UserElements.length * 5;
        let totalScore = 0;

        // 사용자의 요소들을 다각형 요소로 연결
        for (const element of UserElements) {
            let score = 0;

            // 지금 사용자 요소 id == 요청 요소 id 이면 score에 요청 score 값 저장
            for (const reqScore of reqScores) {
                if (element.id == reqScore.id) {
                    score = reqScore.score;
                    break;
                }
            }

            totalScore += score;

            await createPolygon.createElement({
                name: `${element.name}_${createPolygon.id}`,
                score: score 
            });
        }

        let polygonGrade = 0;
        // 다각형의 만족도 등급 계산
        if ((totalScore / perfectScore) > (2 / 3)) {
            polygonGrade = 1;
        } else if ((totalScore / perfectScore) > (1 / 3)) {
            polygonGrade = 2;
        } else {
            polygonGrade = 3;
        }

        createPolygon.grade = polygonGrade;
        await createPolygon.save();

        // 유저와 다각형 연결 
        await user.addPolygon(createPolygon);

        res.status(200).json({ success: true, message: "다각형 생성 성공", polygon_id: createPolygon.id });

    } catch (error) {
        res.status(500).json({ success: false, message: `서버 오류 발생 ${error.message }`});
    }
})


// 다각형 전체 조회
router.get('/read-all', auth, async (req, res) => {
    try {
        const user = req.user;

        // 사용자의 모든 다각형 가져오기
        const userPolygons = await user.getPolygons({
            include: [{ model: PolygonElement, as: 'elements' }] 
        });

        res.status(200).json({ 
            success: true, 
            polygons: userPolygons 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: `서버 오류 발생 ${error.message}` 
        });
    }
});

router.get('/read/:id', auth, async (req, res) => {
    try {
        const user = req.user;
        const polygonId = req.params.id;

        // 사용자의 특정 다각형 가져오기
        const userPolygon = await Polygon.findOne({
            where: { id: polygonId },
            include: [{ model: PolygonElement, as: 'elements' }] // 다각형 요소와 함께
        });

        if (!userPolygon) {
            return res.status(404).json({ 
                success: false, 
                message: "해당 다각형을 찾을 수 없습니다." 
            });
        }

        // 현재 다각형 ID를 기준으로 작은 ID와 큰 ID를 가진 다각형 조회
        const previousPolygon = await Polygon.findOne({
            where: {
                id: {
                    [Op.lt]: polygonId // 현재 다각형 ID보다 작은 ID인 다각형 조회
                }
            },
            order: [['id', 'DESC']] // 내림차순으로 정렬하여 가장 큰 ID를 가진 다각형을 가져옴
        });

        const nextPolygon = await Polygon.findOne({
            where: {
                id: {
                    [Op.gt]: polygonId // 현재 다각형 ID보다 큰 ID인 다각형 조회ㅇ
                }
            },
            order: [['id', 'ASC']] // 오름차순으로 정렬하여 가장 작은 ID를 가진 다각형을 가져옴
        });
        // end 라면 마지막 다각형, start라면 첫번재 다각형 
        const end = !!previousPolygon;
        const start = !!nextPolygon;

        res.status(200).json({ 
            success: true, 
            polygon: userPolygon,
            start,
            end
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: `서버 오류 발생 ${error.message}` 
        });
    }
});




router.get('/questions', auth, async (req, res) => {
    try {
        const user = req.user;

        // 사용자가 가지고 있는 elements를 가져옴
        const userElements = await user.getElements();

        // 최종적으로 모든 질문을 담을 객체
        const allQuestions = {};

        // 각 Element에서 랜덤으로 하나의 question을 선택하여 allQuestions 객체에 추가
        userElements.forEach(element => {
            const randomQuestions = [];
            const questionsArray = element.questions;

            // 중복을 피하면서 다섯 개의 랜덤 질문을 뽑기
            while (randomQuestions.length < 5) {
                const randomIndex = Math.floor(Math.random() * questionsArray.length);
                const randomQuestion = questionsArray[randomIndex];

                if (!randomQuestions.includes(randomQuestion)) {
                    randomQuestions.push(randomQuestion);
                }
            }

            // 요소 이름과 해당 요소에 대한 랜덤 질문들을 allQuestions 객체에 추가
            allQuestions[element.name] = randomQuestions;
        });

        res.status(200).json({ success: true, message: "만족도 질문 생성 성공", elements: allQuestions });
    } catch (error) {
        res.status(500).json({ success: false, message: `서버 오류 발생 ${error.message}` });
    }
});



module.exports = router;
