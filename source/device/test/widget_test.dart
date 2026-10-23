import 'package:flutter_test/flutter_test.dart';
import 'package:device/main.dart';

void main() {
  testWidgets('Vecta connected phone smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const VectaDeviceApp());

    // Verify title and status badges exist
    expect(find.text('VECTA CONNECTED PHONE'), findsOneWidget);
    expect(find.text('v0.0.20'), findsOneWidget);
  });
}
