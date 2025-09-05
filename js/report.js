// 페이지가 모두 로드되면 자동으로 실행됩니다.
window.onload = function() {
    displayReport();
};

// 데이터베이스 파일을 불러오고 리포트 표시를 시작하는 메인 함수
async function displayReport() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const encodedData = urlParams.get('data');

        if (!encodedData) {
            document.querySelector('.report-container').innerHTML = '<h1>잘못된 접근입니다.</h1><p>분석 데이터가 존재하지 않습니다. 관리자에게 문의하세요.</p>';
            return;
        }

        const jsonString = decodeURIComponent(escape(atob(encodedData)));
        const reportData = JSON.parse(jsonString);
        const response = await fetch('js/database.json');
        const dbData = await response.json();
        
        renderUserInfo(reportData.user);
        renderRadarChart(reportData, dbData);
        renderOverallSummary(reportData, dbData); // 이제 이 함수는 텍스트 요약만 담당합니다.
        renderDetailedResults(reportData, dbData);
        renderReportDate(reportData.createdAt);
        setupModal();

    } catch (error) {
        console.error("리포트 생성 중 오류 발생:", error);
        document.querySelector('.report-container').innerHTML = '<h1>리포트 생성 오류</h1><p>데이터를 읽어오는 중 문제가 발생했습니다. 페이지를 새로고침하거나 관리자에게 문의하세요.</p>';
    }
}

// 사용자 정보 섹션을 채우는 함수
function renderUserInfo(user) {
    const userInfoSection = document.getElementById('userInfoSection');
    userInfoSection.innerHTML = `
        <div class="info-item">이름<br><span>${user.name || '정보 없음'}</span></div>
        <div class="info-item">나이<br><span>${user.age || '정보 없음'}</span></div>
        <div class="info-item">성별<br><span>${user.gender === 'female' ? '여성' : '남성'}</span></div>
    `;
}

// 리포트 생성 날짜를 채우는 함수
function renderReportDate(dateString) {
    const reportDateEl = document.getElementById('reportDate');
    const date = new Date(dateString);
    reportDateEl.textContent = `리포트 생성일: ${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

// [수정] 종합 소견(요약) 생성 함수 (더 간단해진 버전)
function renderOverallSummary(reportData, dbData) {
    const summarySection = document.getElementById('summaryTextSection');
    
    const summaryData = {
        '노화': { lowCount: 0, highCount: 0, total: 0 },
        '건조': { lowCount: 0, highCount: 0, total: 0 },
        '색소': { lowCount: 0, highCount: 0, total: 0 }
    };

    for (const geneSymbol in reportData.analysis) {
        const geneInfo = dbData[geneSymbol];
        if (!geneInfo) continue;

        const userGeneData = reportData.analysis[geneSymbol];
        const latestValue = userGeneData.week4 ?? userGeneData.week0;
        if (latestValue === null) continue;

        const ageIndex = getAgeIndex(reportData.user.age);
        const peerAvg = geneInfo.peerData[reportData.user.gender][ageIndex];
        const recommendation = geneInfo.recommendation[latestValue > peerAvg ? 'high' : 'low'];
        
        summaryData[geneInfo.category].total++;
        if (recommendation.status === '낮음') {
            summaryData[geneInfo.category].highCount++;
        } else {
            summaryData[geneInfo.category].lowCount++;
        }
    }

    let summaryItemsHtml = '';
    let hasContent = false;
    for (const category in summaryData) {
        const data = summaryData[category];
        if (data.total === 0) continue;
        hasContent = true;

        let statusClass = '';
        let statusText = '';
        const highRatio = data.highCount / data.total;

        if (highRatio === 0) {
            statusClass = 'excellent'; statusText = '매우 우수';
        } else if (highRatio <= 0.33) {
            statusClass = 'good'; statusText = '양호';
        } else if (highRatio <= 0.66) {
            statusClass = 'needs-attention'; statusText = '관심 필요';
        } else {
            statusClass = 'needs-focus'; statusText = '집중 관리 필요';
        }

        summaryItemsHtml += `
            <div class="summary-item">
                <h3>${category}</h3>
                <p class="status-text ${statusClass}">${statusText}</p>
                <p>총 ${data.total}개 유전자 중<br>${data.highCount}개 항목의 관리가 필요합니다.</p>
            </div>
        `;
    }
    
    if (hasContent) {
        summarySection.innerHTML = `
            <h2 class="section-title">종합 소견</h2>
            <div class="summary-container">
                ${summaryItemsHtml}
            </div>
        `;
    }
}

// 상세 분석 결과 섹션을 채우는 함수
function renderDetailedResults(reportData, dbData) {
    const detailedResultsSection = document.getElementById('detailedResultsSection');
    let content = '';

    for (const geneSymbol in reportData.analysis) {
        const geneInfo = dbData[geneSymbol];
        const userGeneData = reportData.analysis[geneSymbol];

        if (geneInfo) {
            content += createGeneCard(geneSymbol, geneInfo, userGeneData, reportData.user);
        }
    }
    detailedResultsSection.innerHTML = content;
}

// 개별 유전자 카드를 생성하는 함수
function createGeneCard(geneSymbol, geneInfo, userGeneData, user) {
    const ageIndex = getAgeIndex(user.age);
    const peerAvg = geneInfo.peerData[user.gender][ageIndex];
    const latestValue = userGeneData.week4 ?? userGeneData.week0;
    if (latestValue === null) return '';

    const comparison = latestValue > peerAvg ? 'high' : 'low';
    const recommendation = geneInfo.recommendation[comparison];

    let changeRateText = 'N/A';
    if (userGeneData.week0 !== null && userGeneData.week4 !== null && userGeneData.week0 > 0) {
        const change = ((userGeneData.week4 - userGeneData.week0) / userGeneData.week0) * 100;
        const changePrefix = change > 0 ? '+' : '';
        changeRateText = `<span style="color: ${change > 0 ? '#dc3545' : '#0d6efd'};">${changePrefix}${change.toFixed(1)}%</span>`;
    }
    
    const maxVal = peerAvg * 2; 
    const userPercentage = Math.min((latestValue / maxVal) * 100, 100);
    const peerPercentage = 50;
    const statusClass = recommendation.status === '낮음' ? 'high' : 'low';

    return `
        <div class="gene-card">
            <div class="card-header">
                <h3>${geneInfo.name} (${geneSymbol})</h3>
                <span class="status-badge ${statusClass}">${recommendation.status}</span>
            </div>
            <div class="card-body">
                <div class="comparison-section">
                     <p><strong>내 측정값: ${latestValue.toFixed(2)}</strong> (0주차 대비: ${changeRateText})</p>
                    <div class="bar-container">
                        <div class="user-bar" style="width: ${userPercentage}%;"></div>
                        <div class="peer-marker" style="left: ${peerPercentage}%;"></div>
                    </div>
                    <p style="text-align: center; font-size: 0.9em; color: #6c757d;">(막대 중앙의 '평균'선 대비 내 측정값 위치)</p>
                </div>
                
                <h4>결과 메시지</h4>
                <p>${recommendation.message}</p>
                <h4>추천 성분</h4>
                <p>${recommendation.ingredients}</p>
                <h4>추천 제품</h4>
                <p>${recommendation.products}</p>
                <h4>관리 Tip</h4>
                <p>${recommendation.tips}</p>

                <button class="details-button" data-gene="${geneSymbol}">유전자 정보 상세보기</button>
            </div>
        </div>
    `;
}

// 나이를 기반으로 데이터 배열의 인덱스를 반환하는 함수
function getAgeIndex(age) {
    if (age < 30) return 0;
    if (age < 40) return 1;
    if (age < 50) return 2;
    if (age < 60) return 3;
    return 4;
}

// 레이더 차트 생성 함수
function renderRadarChart(reportData, dbData) {
    const canvas = document.getElementById('radarChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const scores = { '노화': [], '건조': [], '색소': [] };

    for (const geneSymbol in reportData.analysis) {
        const geneInfo = dbData[geneSymbol];
        if (!geneInfo) continue;

        const userGeneData = reportData.analysis[geneSymbol];
        const latestValue = userGeneData.week4 ?? userGeneData.week0;
        if (latestValue === null) continue;

        const ageIndex = getAgeIndex(reportData.user.age);
        const peerAvg = geneInfo.peerData[reportData.user.gender][ageIndex];
        const recommendation = geneInfo.recommendation[latestValue > peerAvg ? 'high' : 'low'];

        const score = (recommendation.status === '낮음') ? 25 : 100;
        scores[geneInfo.category].push(score);
    }

    const avgScores = {
        '노화': scores['노화'].length ? scores['노화'].reduce((a, b) => a + b, 0) / scores['노화'].length : 50,
        '건조': scores['건조'].length ? scores['건조'].reduce((a, b) => a + b, 0) / scores['건조'].length : 50,
        '색소': scores['색소'].length ? scores['색소'].reduce((a, b) => a + b, 0) / scores['색소'].length : 50
    };
    
    new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['피부 노화', '피부 건조', '색소 침착'],
            datasets: [{
                label: reportData.user.name + '님의 피부 유전자 프로필',
                data: [avgScores['노화'], avgScores['건조'], avgScores['색소']],
                backgroundColor: 'rgba(13, 110, 253, 0.2)',
                borderColor: 'rgba(13, 110, 253, 1)',
                borderWidth: 2,
                pointBackgroundColor: 'rgba(13, 110, 253, 1)',
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: 'rgba(13, 110, 253, 1)'
            }]
        },
        options: {
            scales: {
                r: {
                    angleLines: { color: 'rgba(0, 0, 0, 0.1)' },
                    grid: { color: 'rgba(0, 0, 0, 0.1)' },
                    pointLabels: { font: { size: 14, weight: 'bold' }, color: '#1a3a6e' },
                    suggestedMin: 0,
                    suggestedMax: 100,
                    ticks: {
                        stepSize: 25,
                        backdropColor: 'rgba(255, 255, 255, 0.75)'
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                }
            }
        }
    });
}

// 모달 관련 이벤트 설정 함수
function setupModal() {
    const modal = document.getElementById('geneModal');
    const closeButton = document.querySelector('.close-button');
    
    document.querySelectorAll('.details-button').forEach(button => {
        button.addEventListener('click', async () => {
            const geneSymbol = button.dataset.gene;
            const response = await fetch('js/database.json');
            const dbData = await response.json();
            const geneInfo = dbData[geneSymbol];
            openModal(geneInfo);
        });
    });

    closeButton.onclick = () => modal.style.display = 'none';
    window.onclick = (event) => {
        if (event.target == modal) {
            modal.style.display = 'none';
        }
    };
}

// 모달을 열고 내용을 채우는 함수
function openModal(geneInfo) {
    const modal = document.getElementById('geneModal');
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <h2>${geneInfo.name} (${geneInfo.category})</h2>
        <p>${geneInfo.description}</p>
        <hr>
        ${geneInfo.details_html}
    `;
    modal.style.display = 'block';
}