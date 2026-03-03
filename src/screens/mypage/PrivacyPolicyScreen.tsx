import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import BlurredBackground from '../../components/common/BlurredBackground';
import ScreenHeader from '../../components/common/ScreenHeader';
import { FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';
import type { ThemeColors } from '../../utils/constants';

const EFFECTIVE_DATE = '2026년 2월 23일';
const COMPANY_EMAIL = 'support@runvs.app';

export default function PrivacyPolicyScreen() {
  const navigation = useNavigation();
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <BlurredBackground>
      <SafeAreaView style={styles.container}>
        <ScreenHeader
          title="개인정보 처리방침"
          onBack={() => navigation.goBack()}
        />
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <Text style={styles.effectiveDate}>시행일: {EFFECTIVE_DATE}</Text>

            <Text style={styles.intro}>
              RUNVS(이하 "회사")는 「개인정보 보호법」 등 관련 법령에 따라 이용자의 개인정보를 보호하고, 이와 관련한 고충을 신속하고 원활하게 처리할 수 있도록 다음과 같이 개인정보 처리방침을 수립·공개합니다.
            </Text>

            {/* 제1조 */}
            <Text style={styles.sectionTitle}>제1조 (개인정보의 수집 항목 및 수집 방법)</Text>
            <Text style={styles.paragraph}>
              회사는 서비스 제공을 위해 다음과 같은 개인정보를 수집합니다.
            </Text>
            <Text style={styles.subTitle}>1. 필수 수집 항목</Text>
            <Text style={styles.bullet}>• 소셜 로그인 정보: Apple ID 또는 Google 계정의 고유 식별자(sub), 이메일 주소(선택 제공 시)</Text>
            <Text style={styles.bullet}>• 프로필 정보: 닉네임</Text>
            <Text style={styles.bullet}>• 위치 정보: 러닝 중 실시간 GPS 좌표(위도, 경도, 고도), 이동 경로</Text>
            <Text style={styles.bullet}>• 러닝 기록: 러닝 시간, 거리, 페이스, 케이던스, 고도 변화</Text>
            <Text style={styles.bullet}>• 기기 정보: 기기 모델, OS 버전, 앱 버전</Text>

            <Text style={styles.subTitle}>2. 선택 수집 항목</Text>
            <Text style={styles.bullet}>• 프로필 사진</Text>
            <Text style={styles.bullet}>• 생년월일, 키, 체중</Text>
            <Text style={styles.bullet}>• 자기소개(Bio), 인스타그램 사용자명</Text>
            <Text style={styles.bullet}>• 활동 지역</Text>
            <Text style={styles.bullet}>• 러닝 장비(신발) 정보</Text>
            <Text style={styles.bullet}>• Apple Health 데이터(심박수, 칼로리)</Text>
            <Text style={styles.bullet}>• 모션 센서 데이터(가속도계, 자이로스코프 — GPS 정확도 향상 목적)</Text>
            <Text style={styles.bullet}>• 연락처 전화번호 (SHA-256 해시 처리, 친구 찾기 동의 시)</Text>

            <Text style={styles.subTitle}>3. 수집 방법</Text>
            <Text style={styles.bullet}>• Apple 또는 Google 소셜 로그인을 통한 자동 수집</Text>
            <Text style={styles.bullet}>• 이용자가 앱 내에서 직접 입력</Text>
            <Text style={styles.bullet}>• 러닝 중 기기의 GPS, 모션 센서를 통한 자동 수집</Text>
            <Text style={styles.bullet}>• Apple Watch 연동 시 HealthKit을 통한 수집</Text>
            <Text style={styles.bullet}>• 연락처 접근 동의 시 기기 연락처의 전화번호를 해시 처리하여 수집</Text>

            {/* 제2조 */}
            <Text style={styles.sectionTitle}>제2조 (개인정보의 수집 및 이용 목적)</Text>
            <Text style={styles.paragraph}>
              회사는 수집한 개인정보를 다음의 목적으로 이용합니다.
            </Text>
            <Text style={styles.bullet}>• 회원 가입 및 관리: 소셜 로그인 기반 본인 확인, 회원 식별, 서비스 부정 이용 방지</Text>
            <Text style={styles.bullet}>• 서비스 제공: 러닝 트래킹, 코스 기록 및 공유, 랭킹 산정, 통계 제공</Text>
            <Text style={styles.bullet}>• 위치 기반 서비스: GPS 경로 기록, 코스 제작, 주변 코스 탐색, 지도 표시</Text>
            <Text style={styles.bullet}>• GPS 정확도 향상: 모션 센서 데이터와 GPS 데이터의 융합 처리를 통한 위치 정밀도 개선</Text>
            <Text style={styles.bullet}>• 건강 데이터 표시: Apple Watch 심박수의 실시간 표시, 칼로리 소모량 기록</Text>
            <Text style={styles.bullet}>• 코스 랭킹 및 경쟁: 코스별 러너 순위 산정 및 공정성 검증</Text>
            <Text style={styles.bullet}>• 서비스 개선: 이용 통계 분석, 오류 진단 및 수정, 서비스 품질 향상</Text>
            <Text style={styles.bullet}>• 연락처 친구 추천: 기기 연락처의 전화번호 해시를 통해 서비스를 이용 중인 지인을 찾아 추천</Text>
            <Text style={styles.bullet}>• 커뮤니케이션: 서비스 공지, 이벤트 안내(푸시 알림 동의 시)</Text>

            {/* 제3조 */}
            <Text style={styles.sectionTitle}>제3조 (개인정보의 보유 및 이용 기간)</Text>
            <Text style={styles.paragraph}>
              회사는 개인정보 수집 및 이용 목적이 달성된 후에는 해당 정보를 지체 없이 파기합니다. 단, 관련 법령에 의해 보존할 필요가 있는 경우 아래와 같이 보관합니다.
            </Text>
            <Text style={styles.bullet}>• 회원 정보: 회원 탈퇴 시 즉시 파기 (단, 부정 이용 방지를 위해 고유 식별자를 탈퇴 후 30일간 보관 후 파기)</Text>
            <Text style={styles.bullet}>• 러닝 기록 및 코스 데이터: 회원 탈퇴 시 즉시 파기</Text>
            <Text style={styles.bullet}>• 위치 정보: 러닝 종료 후 서버에 저장, 회원 탈퇴 시 즉시 파기</Text>
            <Text style={styles.bullet}>• 서비스 이용 로그: 통신비밀보호법에 따라 3개월 보관</Text>
            <Text style={styles.bullet}>• 전자상거래 관련 기록(유료 서비스 도입 시): 전자상거래법에 따라 5년 보관</Text>

            {/* 제4조 */}
            <Text style={styles.sectionTitle}>제4조 (개인정보의 제3자 제공)</Text>
            <Text style={styles.paragraph}>
              회사는 이용자의 개인정보를 원칙적으로 외부에 제공하지 않습니다. 다만, 다음의 경우에는 예외로 합니다.
            </Text>
            <Text style={styles.bullet}>• 이용자가 사전에 동의한 경우</Text>
            <Text style={styles.bullet}>• 법령의 규정에 의거하거나, 수사 목적으로 법령에 정해진 절차와 방법에 따라 수사기관의 요구가 있는 경우</Text>
            <Text style={styles.paragraph}>
              이용자가 공개 코스를 생성하거나 랭킹에 참여하는 경우, 닉네임, 프로필 사진, 러닝 기록(시간, 페이스)이 다른 이용자에게 공개됩니다.
            </Text>

            {/* 제5조 */}
            <Text style={styles.sectionTitle}>제5조 (개인정보 처리의 위탁)</Text>
            <Text style={styles.paragraph}>
              회사는 원활한 서비스 제공을 위해 다음과 같이 개인정보 처리 업무를 위탁하고 있습니다.
            </Text>
            <Text style={styles.bullet}>• Amazon Web Services (AWS): 클라우드 서버 호스팅 및 데이터 저장</Text>
            <Text style={styles.bullet}>• Apple Inc.: Apple 소셜 로그인 인증</Text>
            <Text style={styles.bullet}>• Google LLC: Google 소셜 로그인 인증</Text>
            <Text style={styles.bullet}>• Mapbox Inc.: 지도 서비스 제공 (익명화된 위치 데이터)</Text>
            <Text style={styles.paragraph}>
              회사는 위탁 계약 시 개인정보가 안전하게 관리될 수 있도록 필요한 사항을 규정하고 있습니다.
            </Text>

            {/* 제6조 */}
            <Text style={styles.sectionTitle}>제6조 (위치 정보의 수집 및 이용)</Text>
            <Text style={styles.paragraph}>
              회사는 「위치정보의 보호 및 이용 등에 관한 법률」에 따라 이용자의 위치정보를 다음과 같이 수집·이용합니다.
            </Text>
            <Text style={styles.bullet}>• 수집 시점: 이용자가 러닝을 시작하여 종료할 때까지</Text>
            <Text style={styles.bullet}>• 수집 방법: GPS, Wi-Fi, 셀룰러 네트워크를 통한 실시간 위치 측정</Text>
            <Text style={styles.bullet}>• 이용 목적: 러닝 경로 기록, 거리·페이스 계산, 코스 제작, 지도 표시, 랭킹 공정성 검증</Text>
            <Text style={styles.bullet}>• 백그라운드 위치 수집: 러닝 중 앱이 백그라운드 상태일 때에도 정확한 경로 기록을 위해 위치 정보를 수집합니다. 이는 러닝 트래킹 기능에 필수적이며, 러닝이 종료되면 백그라운드 위치 수집도 즉시 중단됩니다.</Text>
            <Text style={styles.bullet}>• 원시 GPS 데이터: 랭킹 공정성 검증 및 GPS 알고리즘 개선을 위해 원시 GPS 데이터를 서버에 저장합니다.</Text>

            {/* 제7조 */}
            <Text style={styles.sectionTitle}>제7조 (Apple HealthKit 데이터)</Text>
            <Text style={styles.paragraph}>
              회사는 이용자의 동의 하에 Apple HealthKit을 통해 다음 데이터를 읽거나 기록할 수 있습니다.
            </Text>
            <Text style={styles.bullet}>• 읽기: 심박수 (러닝 중 실시간 BPM 표시)</Text>
            <Text style={styles.bullet}>• 쓰기: 운동 기록 (거리, 시간, 칼로리, 경로)</Text>
            <Text style={styles.paragraph}>
              HealthKit 데이터는 광고, 마케팅, 데이터 마이닝 등의 목적으로 사용되지 않으며, 제3자에게 판매되지 않습니다. HealthKit 데이터는 이용자의 기기에서 Apple Health 앱으로만 전달되며, 회사의 서버에는 저장되지 않습니다.
            </Text>

            {/* 제8조 */}
            <Text style={styles.sectionTitle}>제8조 (연락처 데이터의 처리)</Text>
            <Text style={styles.paragraph}>
              회사는 이용자의 동의 하에 기기 연락처에 저장된 전화번호를 다음과 같이 처리합니다.
            </Text>
            <Text style={styles.bullet}>• 처리 방법: 전화번호는 이용자의 기기에서 SHA-256 알고리즘으로 해시(암호화) 처리된 후 서버에 전송됩니다. 원본 전화번호는 서버로 전송되지 않습니다.</Text>
            <Text style={styles.bullet}>• 이용 목적: 연락처에 저장된 지인 중 RUNVS를 사용하는 이용자를 찾아 팔로우를 추천합니다.</Text>
            <Text style={styles.bullet}>• 보관: 매칭에 사용된 연락처 해시 데이터는 조회 즉시 폐기되며, 서버에 보관되지 않습니다.</Text>
            <Text style={styles.bullet}>• 본인 전화번호 해시: 이용자가 직접 등록한 본인의 전화번호 해시는 다른 이용자의 친구 찾기에 활용되며, 설정에서 언제든 삭제할 수 있습니다.</Text>
            <Text style={styles.bullet}>• 동의 철회: 앱 설정에서 전화번호 해시를 삭제하고 기기의 연락처 접근 권한을 철회할 수 있습니다.</Text>

            {/* 제9조 */}
            <Text style={styles.sectionTitle}>제9조 (이용자의 권리와 행사 방법)</Text>
            <Text style={styles.paragraph}>
              이용자는 언제든지 다음과 같은 권리를 행사할 수 있습니다.
            </Text>
            <Text style={styles.bullet}>• 개인정보 열람 요구: 앱 내 마이페이지에서 본인의 프로필 정보, 러닝 기록을 확인할 수 있습니다.</Text>
            <Text style={styles.bullet}>• 개인정보 수정 요구: 앱 내 프로필 편집에서 닉네임, 프로필 사진 등을 수정할 수 있습니다.</Text>
            <Text style={styles.bullet}>• 개인정보 삭제 요구: 앱 내 설정에서 회원 탈퇴를 통해 모든 개인정보를 삭제할 수 있습니다.</Text>
            <Text style={styles.bullet}>• 처리 정지 요구: 위치 정보 수집은 러닝을 시작하지 않으면 수집되지 않으며, 기기 설정에서 위치 권한을 철회할 수 있습니다.</Text>
            <Text style={styles.bullet}>• 동의 철회: 소셜 로그인 연동은 각 플랫폼(Apple, Google)의 계정 설정에서 해제할 수 있습니다.</Text>

            {/* 제10조 */}
            <Text style={styles.sectionTitle}>제10조 (개인정보의 파기 절차 및 방법)</Text>
            <Text style={styles.paragraph}>
              회사는 개인정보 보유 기간의 경과, 처리 목적 달성 등 개인정보가 불필요하게 되었을 때에는 지체 없이 해당 개인정보를 파기합니다.
            </Text>
            <Text style={styles.bullet}>• 파기 절차: 이용자가 회원 탈퇴를 요청하면 즉시 파기 절차를 진행합니다.</Text>
            <Text style={styles.bullet}>• 파기 방법: 전자적 파일은 복구 불가능한 방법으로 영구 삭제합니다.</Text>

            {/* 제11조 */}
            <Text style={styles.sectionTitle}>제11조 (개인정보의 안전성 확보 조치)</Text>
            <Text style={styles.paragraph}>
              회사는 개인정보의 안전성 확보를 위해 다음과 같은 조치를 취하고 있습니다.
            </Text>
            <Text style={styles.bullet}>• 데이터 암호화: 전송 시 TLS/HTTPS 암호화, 비밀번호 및 토큰의 암호화 저장</Text>
            <Text style={styles.bullet}>• 접근 권한 관리: 개인정보 접근 권한을 최소한으로 제한</Text>
            <Text style={styles.bullet}>• 보안 프로그램 설치 및 갱신: 서버 보안 소프트웨어 운용</Text>
            <Text style={styles.bullet}>• 인증 토큰 관리: JWT 기반 인증, 토큰 만료 및 갱신 체계 적용</Text>

            {/* 제12조 */}
            <Text style={styles.sectionTitle}>제12조 (만 14세 미만 아동의 개인정보)</Text>
            <Text style={styles.paragraph}>
              회사는 만 14세 미만 아동의 개인정보를 수집하지 않습니다. 만 14세 미만의 이용자가 개인정보를 제공한 사실이 확인되면 해당 정보를 즉시 삭제하고 해당 계정을 차단합니다.
            </Text>

            {/* 제13조 */}
            <Text style={styles.sectionTitle}>제13조 (쿠키 및 자동 수집 장치)</Text>
            <Text style={styles.paragraph}>
              회사는 모바일 앱 기반 서비스로, 웹 쿠키를 사용하지 않습니다. 다만, 서비스 품질 향상 및 오류 진단을 위해 앱 사용 로그(비식별화된 충돌 리포트, 성능 메트릭)를 자동으로 수집할 수 있습니다.
            </Text>

            {/* 제14조 */}
            <Text style={styles.sectionTitle}>제14조 (국외 이전)</Text>
            <Text style={styles.paragraph}>
              회사는 서비스 제공을 위해 다음과 같이 개인정보를 국외로 이전합니다.
            </Text>
            <Text style={styles.bullet}>• 이전 국가: 대한민국 (AWS 서울 리전, ap-northeast-2)</Text>
            <Text style={styles.bullet}>• 이전 항목: 회원 정보, 러닝 기록, 코스 데이터</Text>
            <Text style={styles.bullet}>• 이전 목적: 클라우드 서버를 통한 서비스 제공</Text>
            <Text style={styles.bullet}>• 보유 기간: 회원 탈퇴 시까지</Text>

            {/* 제15조 - GDPR/CCPA */}
            <Text style={styles.sectionTitle}>제15조 (해외 이용자의 권리)</Text>
            <Text style={styles.subTitle}>EU/EEA 거주자 (GDPR)</Text>
            <Text style={styles.paragraph}>
              EU/EEA 지역 거주자는 GDPR에 따라 다음의 권리를 가집니다.
            </Text>
            <Text style={styles.bullet}>• 개인정보 접근권, 정정권, 삭제권(잊혀질 권리)</Text>
            <Text style={styles.bullet}>• 처리 제한권, 데이터 이동권</Text>
            <Text style={styles.bullet}>• 프로파일링을 포함한 자동화된 의사결정에 대한 이의 제기권</Text>
            <Text style={styles.bullet}>• 개인정보 처리의 법적 근거: 서비스 이용 계약의 이행(제6조 1항 b호), 이용자의 동의(제6조 1항 a호)</Text>

            <Text style={styles.subTitle}>미국 캘리포니아주 거주자 (CCPA/CPRA)</Text>
            <Text style={styles.paragraph}>
              캘리포니아 거주자는 CCPA/CPRA에 따라 다음의 권리를 가집니다.
            </Text>
            <Text style={styles.bullet}>• 수집된 개인정보의 범주 및 출처를 알 권리</Text>
            <Text style={styles.bullet}>• 개인정보 삭제 요청 권리</Text>
            <Text style={styles.bullet}>• 개인정보 판매 거부 권리 (회사는 개인정보를 판매하지 않습니다)</Text>
            <Text style={styles.bullet}>• 권리 행사에 따른 차별 금지</Text>

            {/* 제16조 */}
            <Text style={styles.sectionTitle}>제16조 (개인정보 보호책임자)</Text>
            <Text style={styles.paragraph}>
              회사는 개인정보 처리에 관한 업무를 총괄해서 책임지고, 이용자의 불만 처리 및 피해 구제를 위하여 아래와 같이 개인정보 보호책임자를 지정하고 있습니다.
            </Text>
            <Text style={styles.bullet}>• 이메일: {COMPANY_EMAIL}</Text>
            <Text style={styles.paragraph}>
              이용자는 서비스 이용 중 발생한 모든 개인정보 보호 관련 문의, 불만 처리, 피해 구제 등에 관한 사항을 위 이메일로 문의하실 수 있습니다. 회사는 이용자의 문의에 대해 지체 없이 답변 및 처리하겠습니다.
            </Text>

            {/* 제17조 */}
            <Text style={styles.sectionTitle}>제17조 (개인정보 처리방침의 변경)</Text>
            <Text style={styles.paragraph}>
              이 개인정보 처리방침은 {EFFECTIVE_DATE}부터 적용됩니다. 법령이나 서비스의 변경 사항을 반영하기 위해 개인정보 처리방침을 수정할 수 있으며, 변경 시에는 앱 내 공지를 통해 알려드리겠습니다.
            </Text>

            {/* 부칙 */}
            <Text style={styles.sectionTitle}>권익 침해 구제 방법</Text>
            <Text style={styles.paragraph}>
              개인정보 침해에 대한 신고나 상담이 필요한 경우 아래 기관에 문의하실 수 있습니다.
            </Text>
            <Text style={styles.bullet}>• 개인정보침해 신고센터: privacy.kisa.or.kr (국번없이 118)</Text>
            <Text style={styles.bullet}>• 개인정보 분쟁조정위원회: kopico.go.kr (1833-6972)</Text>
            <Text style={styles.bullet}>• 대검찰청 사이버수사과: spo.go.kr (국번없이 1301)</Text>
            <Text style={styles.bullet}>• 경찰청 사이버안전국: cyberbureau.police.go.kr (국번없이 182)</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </BlurredBackground>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    scrollView: {
      flex: 1,
    },
    content: {
      paddingHorizontal: SPACING.xxl,
      paddingBottom: SPACING.xxxl + SPACING.xl,
    },
    card: {
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: c.border,
      padding: SPACING.xl,
      gap: SPACING.xs,
    },
    effectiveDate: {
      fontSize: FONT_SIZES.sm,
      color: c.textTertiary,
      fontWeight: '500',
      marginBottom: SPACING.sm,
    },
    intro: {
      fontSize: FONT_SIZES.sm,
      color: c.textSecondary,
      lineHeight: 22,
      marginBottom: SPACING.md,
    },
    sectionTitle: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.text,
      marginTop: SPACING.lg,
      marginBottom: SPACING.xs,
    },
    subTitle: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.textSecondary,
      marginTop: SPACING.sm,
      marginBottom: SPACING.xs,
    },
    paragraph: {
      fontSize: FONT_SIZES.sm,
      color: c.textSecondary,
      lineHeight: 22,
      marginBottom: SPACING.xs,
    },
    bullet: {
      fontSize: FONT_SIZES.sm,
      color: c.textSecondary,
      lineHeight: 22,
      paddingLeft: SPACING.sm,
    },
  });
