package com.queue.metro.admin

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.queue.metro.ui.LocalMetroColors
import com.queue.metro.ui.components.MetroButton
import com.queue.metro.ui.components.MetroChoice
import com.queue.metro.ui.components.MetroDivider
import com.queue.metro.ui.components.MetroSectionLabel
import java.text.DateFormat
import java.util.Date

@Composable
fun AdminScreen(viewModel: AdminViewModel, onClose: () -> Unit) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val colors = LocalMetroColors.current
    val context = LocalContext.current
    var cameraVisible by remember { mutableStateOf(false) }
    var bootstrapCode by remember { mutableStateOf("") }
    var displayName by remember { mutableStateOf("Owner") }
    var approvalNote by remember(state.candidate?.requestId) { mutableStateOf(state.candidate?.note.orEmpty()) }
    val imagePicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri: Uri? ->
        uri?.let(viewModel::scanImage)
    }
    val cameraPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        cameraVisible = granted
        if (!granted) viewModel.clearMessage()
    }

    LaunchedEffect(state.adminId) {
        if (state.adminId.isNotBlank()) viewModel.loadDevices()
    }

    if (cameraVisible) {
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            CameraQrScanner(
                onCode = { raw -> cameraVisible = false; viewModel.handleQr(raw) },
                modifier = Modifier.fillMaxSize(),
            )
            Column(Modifier.align(Alignment.TopStart).padding(20.dp)) {
                Text("scan approval", color = Color.White, fontSize = 36.sp, fontWeight = FontWeight.Light)
                TextButton(onClick = { cameraVisible = false }) { Text("關閉", color = Color.White) }
            }
            Text(
                "將限時 QR 放在框內",
                color = Color.White,
                modifier = Modifier.align(Alignment.BottomCenter).padding(32.dp),
            )
        }
        return
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().background(colors.background),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("admin", color = colors.foreground, fontSize = 44.sp, fontWeight = FontWeight.Light)
                MetroButton("返回", onClose)
            }
            Text("Keystore 簽署管理", color = colors.accent, fontSize = 13.sp)
        }
        item {
            MetroSectionLabel("連線")
            AdminField("管理服務 HTTPS 網址", state.serverUrl, viewModel::setServerUrl)
            Spacer(Modifier.height(8.dp))
            MetroButton("儲存網址", viewModel::saveServerUrl)
        }
        if (state.adminId.isBlank()) {
            item {
                MetroDivider()
                MetroSectionLabel("首次擁有者初始化")
                Text(
                    "初始化密碼只在這一次經 HTTPS 傳送，不會寫入 App；私鑰由 Android Keystore 產生且不可匯出。",
                    color = colors.muted,
                    fontSize = 13.sp,
                    lineHeight = 19.sp,
                )
                Spacer(Modifier.height(12.dp))
                AdminField("管理員名稱", displayName, { displayName = it })
                Spacer(Modifier.height(8.dp))
                AdminField("OWNER_BOOTSTRAP_CODE", bootstrapCode, { bootstrapCode = it }, password = true)
                Spacer(Modifier.height(10.dp))
                MetroButton("建立首位擁有者", { viewModel.bootstrap(displayName, bootstrapCode) })
            }
        } else {
            item {
                MetroDivider()
                MetroSectionLabel("掃描授權")
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    MetroButton(
                        "相機掃描",
                        {
                            if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) cameraVisible = true
                            else cameraPermission.launch(Manifest.permission.CAMERA)
                        },
                        Modifier.weight(1f),
                    )
                    MetroButton(
                        "選取截圖",
                        { imagePicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                        Modifier.weight(1f),
                    )
                }
            }
            state.candidate?.let { candidate ->
                item {
                    CandidatePanel(candidate, approvalNote, { approvalNote = it }, viewModel)
                }
            }
            item {
                MetroDivider()
                MetroSectionLabel("裝置列表")
                AdminField("搜尋裝置編號或備註", state.search, viewModel::setSearch)
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("all" to "全部", "allowed" to "允許", "blocked" to "封鎖", "revoked" to "撤銷")
                        .forEach { (value, label) ->
                            MetroChoice(label, state.statusFilter == value, { viewModel.setStatusFilter(value) }, Modifier.weight(1f))
                        }
                }
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    MetroChoice(if (state.oldestFirst) "最舊優先" else "最新優先", true, { viewModel.setOldestFirst(!state.oldestFirst) }, Modifier.weight(1f))
                    MetroButton("套用／搜尋", viewModel::loadDevices, Modifier.weight(1f))
                }
            }
        }
        if (state.message.isNotBlank()) {
            item {
                Text(state.message, color = colors.accent, fontSize = 14.sp)
            }
        }
        if (state.isBusy) {
            item { CircularProgressIndicator(color = colors.accent) }
        }
        if (state.adminId.isNotBlank()) {
            items(state.devices, key = { it.id }) { device -> DevicePanel(device, viewModel) }
            if (!state.isBusy && state.devices.isEmpty()) item { Text("沒有符合條件的裝置", color = colors.muted) }
        }
        item { Spacer(Modifier.height(30.dp)) }
    }
}

@Composable
private fun CandidatePanel(candidate: ApprovalCandidate, note: String, onNote: (String) -> Unit, viewModel: AdminViewModel) {
    val colors = LocalMetroColors.current
    Column(Modifier.fillMaxWidth().background(colors.surface).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("待批裝置", color = colors.accent, fontSize = 22.sp)
        Text(candidate.deviceId, color = colors.foreground, fontSize = 13.sp)
        Text(candidate.userAgent.ifBlank { "未知瀏覽器" }, color = colors.muted, fontSize = 12.sp, lineHeight = 18.sp)
        Text("申請：${formatDate(candidate.createdAt)}　到期：${formatDate(candidate.expiresAt)}", color = colors.muted, fontSize = 12.sp)
        AdminField("備註", note, onNote)
        Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            MetroButton("允許", { viewModel.decide("allow", note) }, Modifier.weight(1f))
            MetroButton("取消", { viewModel.decide("cancel", note) }, Modifier.weight(1f))
            MetroButton("封鎖", { viewModel.decide("block", note) }, Modifier.weight(1f))
        }
    }
}

@Composable
private fun DevicePanel(device: AdminDevice, viewModel: AdminViewModel) {
    val colors = LocalMetroColors.current
    Column(Modifier.fillMaxWidth().background(colors.surface).padding(15.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(device.status.uppercase(), color = if (device.status == "blocked") Color(0xFFFF7777) else colors.accent, fontSize = 13.sp)
            Text(formatDate(device.lastSeenAt), color = colors.muted, fontSize = 11.sp)
        }
        Text(device.note.ifBlank { "未加備註" }, color = colors.foreground, fontSize = 18.sp)
        Text(device.id, color = colors.muted, fontSize = 11.sp)
        Text(device.userAgent, color = colors.muted, fontSize = 11.sp, lineHeight = 16.sp, maxLines = 2)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            when (device.status) {
                "blocked" -> MetroButton("解封並待重新申請", { viewModel.updateDevice(device, "unblock") })
                "allowed" -> {
                    MetroButton("撤銷", { viewModel.updateDevice(device, "revoke") }, Modifier.weight(1f))
                    MetroButton("封鎖", { viewModel.updateDevice(device, "block") }, Modifier.weight(1f))
                }
                else -> {
                    MetroButton("允許", { viewModel.updateDevice(device, "allow") }, Modifier.weight(1f))
                    MetroButton("封鎖", { viewModel.updateDevice(device, "block") }, Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
private fun AdminField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    password: Boolean = false,
) {
    val colors = LocalMetroColors.current
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
        visualTransformation = if (password) PasswordVisualTransformation() else VisualTransformation.None,
        colors = androidx.compose.material3.OutlinedTextFieldDefaults.colors(
            focusedTextColor = colors.foreground,
            unfocusedTextColor = colors.foreground,
            focusedBorderColor = colors.accent,
            unfocusedBorderColor = colors.line,
            focusedLabelColor = colors.accent,
            unfocusedLabelColor = colors.muted,
            cursorColor = colors.accent,
        ),
    )
}

private fun formatDate(timestamp: Long): String =
    if (timestamp <= 0) "—" else DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(timestamp))
