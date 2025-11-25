// ========== Deposit ==========
let totalIDN_All = 0;
let totalMotion_All = 0;

// ========== Withdraw ==========
let totalPembukuan_All = 0;
let totalWithdrawMotion_All = 0;

// ========== Fungsi Deposit ==========
function readCSV(file, callback) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;

        // Parsing CSV
        const rows = text.split(/\r?\n/).map(line => {
            const regex = /("([^"]|"")*"|[^,]+|),?/g;
            let matches = [...line.matchAll(regex)];
            return matches.map(m => m[1].replace(/^"|"$/g, "").replace(/""/g, '"'));
        });

        callback(rows);
    };
    reader.readAsText(file);
}

function readXLSX(file, callback) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const sheet = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
        callback(sheet);
    };
    reader.readAsArrayBuffer(file);
}

function extractIdFromDescription(text) {
    if (!text) return "";
    const parts = text.split(" ");
    return parts[parts.length - 1].trim();
}

function processFiles() {
    totalIDN_All = 0;
    totalMotion_All = 0;
    
    const file1 = document.getElementById("file1").files[0];
    const file2List = document.getElementById("file2").files;

    if (!file1 || file2List.length === 0) {
        alert("Harap upload File PGA IDN dan File PGA Motion!");
        return;
    }

    // ====== FILE IDN CSV ======
    readCSV(file1, file1Rows => {
        let idnMap = {};
        let idnRefMap = {};

        for (let i = 1; i < file1Rows.length; i++) {
            const row = file1Rows[i];
            const id = row[0];
            const nominal = row[7];
            const noRef = row[1];
            
            if (!isNaN(Number(String(nominal).replace(/[^0-9]/g, "")))) {
                totalIDN_All += Number(String(nominal).replace(/[^0-9]/g, ""));
            }
            
            if (id) {
                idnMap[id.trim()] = nominal ? formatNumber(nominal) : "";
                idnRefMap[id.trim()] = noRef || "";
            }
        }

        // ====== FILE MOTION XLSX ======
        let motionMap = {};
        let motionRefMap = {};
        let dateMismatchList = [];
        let filesProcessed = 0;

        for (let f = 0; f < file2List.length; f++) {
            readXLSX(file2List[f], sheet => {

                for (let i = 1; i < sheet.length; i++) {
                    const row = sheet[i];

                    // ====== DATA MOTION ======
                    const desc = row[5];     // kolom F
                    const extractedId = extractIdFromDescription(desc);
                    const nominal = row[14]; // kolom O
                    const noRefMotion = row[3] ? cleanMotionReference(row[3]) : "";
                    
                    if (!isNaN(Number(String(nominal).replace(/[^0-9]/g, "")))) {
                        totalMotion_All += Number(String(nominal).replace(/[^0-9]/g, ""));
                    }

                    // ====== CEK TANGGAL ======
                    const tA = row[0];  // Kolom A
                    const tP = row[15]; // Kolom P

                    if (tA && tP) {
                        let dateA = String(tA).split(" ")[0];
                        let dateP = String(tP).split(" ")[0];

                        if (dateA !== dateP) {
                            dateMismatchList.push({
                                id: extractedId || "-",
                                tanggalA: tA,
                                tanggalP: tP,
                                nominalMotion: nominal
                            });
                        }
                    }

                    if (extractedId) {
                        motionMap[extractedId] = nominal ? formatNumber(nominal) : "";
                        motionRefMap[extractedId] = noRefMotion;
                    }
                }

                filesProcessed++;

                if (filesProcessed === file2List.length) {
                    compareResults(idnMap, motionMap, idnRefMap, motionRefMap, dateMismatchList);
                }
            });
        }
    });
}

function cleanMotionReference(ref) {
    if (!ref) return "";
    return String(ref).replace(/^'/, "").trim();
}

function compareResults(idnMap, motionMap, idnRefMap, motionRefMap, dateMismatchList) {
    let onlyInIDN = [];
    let onlyInMotion = [];

    const allIDs = new Set([
        ...Object.keys(idnMap),
        ...Object.keys(motionMap)
    ]);

    allIDs.forEach(id => {
        const nomIDN = idnMap[id];
        const nomMotion = motionMap[id];
        const refIDN = idnRefMap[id] || "-";
        const refMotion = motionRefMap[id] || "-";

        if (nomIDN && !nomMotion) {
            onlyInIDN.push({ 
                id, 
                idn: nomIDN, 
                motion: "-",
                refIDN: refIDN,
                refMotion: "-"
            });

        } else if (!nomIDN && nomMotion) {
            onlyInMotion.push({ 
                id, 
                idn: "-", 
                motion: nomMotion,
                refIDN: "-",
                refMotion: refMotion
            });
        }
    });

    showResult(onlyInIDN, onlyInMotion, dateMismatchList);
}

function showResult(miss1, miss2, dateMismatch) {
    let html = "<h3>Hasil Anomali Deposit</h3>";

    // TABEL TOTAL NOMINAL IDN & MOTION
    let selisihTotal = totalIDN_All - totalMotion_All;
    html += `
        <table>
            <tr>
                <th>Total IDN</th>
                <th>Total Motion</th>
                <th>Selisih</th>
            </tr>
            <tr>
                <td>${formatNominal(totalIDN_All)}</td>
                <td>${formatNominal(totalMotion_All)}</td>
                <td>${formatNominal(selisihTotal)}</td>
            </tr>
        </table>
        <br>
    `;

    // TABEL MISS 1 - ID Ada di IDN tapi Tidak Ada di Motion
    html += "<h4>ID Ada di IDN tapi Tidak Ada di Motion</h4>";

    if (miss1.length === 0) {
        html += `<p><i>Tidak ada anomali</i></p>`;
    } else {
        let totalIDN_1 = 0;
        let totalMotion_1 = 0;

        let table1 = `
            <table>
                <tr>
                    <th>ID</th>
                    <th>Nomor Ref</th>
                    <th>Nominal</th>
                </tr>
        `;

        miss1.forEach(a => {
            if (a.idn !== "-")
                totalIDN_1 += Number(String(a.idn).replace(/[^0-9]/g, ""));

            table1 += `
                <tr>
                    <td>${a.id}</td>
                    <td>${a.refIDN}</td>
                    <td>${a.idn !== "-" ? formatNominal(a.idn) : "-"}</td>
                </tr>
            `;
        });

        table1 += `
            <tr style="font-weight:bold; background:#f5f5f5;">
                <td colspan="2">TOTAL</td>
                <td>${formatNominal(totalIDN_1)}</td>
            </tr>
        `;

        table1 += "</table>";
        html += table1;
    }

    // TABEL MISS 2 - ID Ada di Motion tapi Tidak Ada di IDN
    html += "<h4>ID Ada di Motion tapi Tidak Ada di IDN</h4>";

    if (miss2.length === 0) {
        html += `<p><i>Tidak ada anomali</i></p>`;
    } else {
        let totalIDN_2 = 0;
        let totalMotion_2 = 0;

        let table2 = `
            <table>
                <tr>
                    <th>ID</th>
                    <th>Nomor Ref</th>
                    <th>Nominal</th>
                </tr>
        `;

        miss2.forEach(a => {
            if (a.motion !== "-")
                totalMotion_2 += Number(String(a.motion).replace(/[^0-9]/g, ""));

            table2 += `
                <tr>
                    <td>${a.id}</td>
                    <td>${a.refMotion}</td>
                    <td>${a.motion !== "-" ? formatNominal(a.motion) : "-"}</td>
                </tr>
            `;
        });

        table2 += `
            <tr style="font-weight:bold; background:#f5f5f5;">
                <td colspan="2">TOTAL</td>
                <td>${formatNominal(totalMotion_2)}</td>
            </tr>
        `;

        table2 += "</table>";
        html += table2;
    }

    // PERBEDAAN TANGGAL DIPROSES
    html += "<h4>Perbedaan Tanggal Diproses</h4>";
    html += dateMismatchToTable(dateMismatch);

    document.getElementById("result").innerHTML = html;
}

function arrayToTable(arr) {
    if (arr.length === 0) return "<p><i>Tidak ada</i></p>";

    let html = "<table><tr><th>ID</th><th>IDN</th><th>Motion</th></tr>";
    arr.forEach(a => {
        html += `<tr>
            <td>${a.id}</td>
            <td>${a.idn}</td>
            <td>${a.motion}</td>
        </tr>`;
    });
    html += "</table>";
    return html;
}

function dateMismatchToTable(arr) {
    if (arr.length === 0)
        return "<p><i>Tidak ada anomali</i></p>";

    let html = `
        <table>
            <tr>
                <th>ID</th>
                <th>Tanggal IDN</th>
                <th>Tanggal Motion</th>
                <th>Nominal</th>
            </tr>
    `;

    arr.forEach(a => {
        let nominalValue = "-";

        if (a.nominalMotion && a.nominalMotion !== "-") {
            nominalValue = formatNominal(a.nominalMotion);
        }

        html += `
            <tr>
                <td>${a.id}</td>
                <td>${a.tanggalA}</td>
                <td>${a.tanggalP}</td>
                <td>${nominalValue}</td>
            </tr>
        `;
    });

    html += "</table>";
    return html;
}

function formatNumber(num) {
    if (!num) return "";
    num = String(num).replace(/,/g, "").trim();
    if (num === "" || isNaN(num)) return num;
    return Number(num).toLocaleString("en-US");
}


// ========== Fungsi Withdraw ==========
function processWithdraw() {
    totalPembukuan_All = 0;
    totalWithdrawMotion_All = 0;
    
    const file1 = document.getElementById("wfile1").files[0];
    const file2 = document.getElementById("wfile2").files;

    if (!file1 || file2.length === 0) {
        alert("Harap upload File Pembukuan dan File PGA Motion!");
        return;
    }

    // ========== BACA FILE 1 (XLSX) ==========
    readXLSX(file1, sheet1 => {
    let idnData = {};
    let idnRefMap = {}; // NEW: Simpan referensi dari file1 (Kolom A)

    for (let i = 1; i < sheet1.length; i++) {
        const row = sheet1[i];
        const noRef = row[0];      // Kolom A - Trx Number
        const username = row[2];   // kolom C
        const nominal = row[7];    // kolom H

        if (!username) continue;

        const u = String(username).trim();
        if (u.toLowerCase() === "username") continue;

        const clean = String(nominal).replace(/[^0-9]/g, "");
        if (!clean) continue;

        if (!idnData[u]) idnData[u] = [];
        idnData[u].push(Number(clean));
        
        if (!idnRefMap[u]) idnRefMap[u] = [];
        idnRefMap[u].push(noRef || "-");
    
        const nominalPembukuan = row[7];
        if (!isNaN(Number(String(nominalPembukuan).replace(/[^0-9]/g, "")))) {
            totalPembukuan_All += Number(String(nominalPembukuan).replace(/[^0-9]/g, ""));
        }
    }

        // ========== BACA FILE 2 (XLSX) ==========
        let motionData = {};
        let motionRefMap = {};
        let processed = 0;

        for (let f = 0; f < file2.length; f++) {
            readXLSX(file2[f], sheet2 => {
                for (let i = 1; i < sheet2.length; i++) {
                    const row = sheet2[i];
                    const noRef = row[2];   // Kolom C - No Ref
                    const desc = row[7];    // kolom H
                    const nominal = row[9]; // kolom J

                    if (!desc) continue;

                    const firstWord = String(desc).trim().split(" ")[0];
                    if (!firstWord) continue;

                    const clean2 = String(nominal).replace(/[^0-9]/g, "");
                    if (!clean2) continue;

                    if (!motionData[firstWord]) motionData[firstWord] = [];
                    motionData[firstWord].push(Number(clean2));
                    
                    if (!motionRefMap[firstWord]) motionRefMap[firstWord] = [];
                    motionRefMap[firstWord].push(noRef || "-");
                
                    const nominalMotionW = row[9];
                    if (!isNaN(Number(String(nominalMotionW).replace(/[^0-9]/g, "")))) {
                        totalWithdrawMotion_All += Number(String(nominalMotionW).replace(/[^0-9]/g, ""));
                    }
                }

                processed++;
                if (processed === file2.length) {
                    compareWithdraw(idnData, motionData, idnRefMap, motionRefMap);
                }
            });
        }
    });
}


function compareWithdraw(idnData, motionData, idnRefMap, motionRefMap) {
    let allIDs = new Set([...Object.keys(idnData), ...Object.keys(motionData)]);
    let anomalies = [];

    allIDs.forEach(id => {
        const list1 = idnData[id] || [];
        const list2 = motionData[id] || [];
        const refs1 = idnRefMap[id] || [];
        const refs2 = motionRefMap[id] || [];

        if (list1.length !== list2.length) {
            let temp1 = [...list1];
            let temp2 = [...list2];
            let tempRefs1 = [...refs1];
            let tempRefs2 = [...refs2];

            for (let i = temp1.length - 1; i >= 0; i--) {
                const idx = temp2.indexOf(temp1[i]);
                if (idx !== -1) {
                    temp1.splice(i, 1);
                    temp2.splice(idx, 1);
                    tempRefs1.splice(i, 1);
                    tempRefs2.splice(idx, 1);
                }
            }

            anomalies.push({
                id: id,
                f1: list1.length,
                f2: list2.length,
                missingFromFile2: temp1,
                missingFromFile1: temp2,
                missingRefsFile2: tempRefs1,
                missingRefsFile1: tempRefs2
            });
        }
    });

    showWithdrawResult(anomalies);
}

function showWithdrawResult(list) {
    let html = "<h3>Hasil Anomali Withdraw</h3>";
    let selisihTotal = totalPembukuan_All - totalWithdrawMotion_All;

    html += `
        <table>
            <tr>
                <th>Total Pembukuan</th>
                <th>Total Motion</th>
                <th>Selisih</th>
            </tr>
            <tr>
                <td>${formatNominal(totalPembukuan_All)}</td>
                <td>${formatNominal(totalWithdrawMotion_All)}</td>
                <td>${formatNominal(selisihTotal)}</td>
            </tr>
        </table>
        <br>
    `;

    if (list.length === 0) {
        html += "<p><i>Tidak ada anomali</i></p>";
        document.getElementById("wresult").innerHTML = html;
        return;
    }

    html += "<h4>ID Anomali</h4>";
html += `
    <table>
        <tr>
            <th>ID</th>
            <th>Jumlah Pembukuan</th>
            <th>Jumlah Motion</th>
            <th>Nominal Pembukuan</th>
            <th>Nominal Motion</th>
        </tr>
    `;

    let totalPembukuan = 0;
    let totalMotion = 0;

    list.forEach(a => {
        a.missingFromFile2.forEach(v => totalPembukuan += Number(v));
        a.missingFromFile1.forEach(v => totalMotion += Number(v));

        html += `
        <tr>
            <td>${a.id}</td>
            <td>${a.f1}</td>
            <td>${a.f2}</td>
            <td>
                ${
                    a.missingFromFile2.length
                    ? a.missingFromFile2.map((v, index) => 
                        `${formatNominal(v)}<br><small style="color:#666">${a.missingRefsFile2[index] || "-"}</small>`
                      ).join("<br>")
                    : "-"
                }
            </td>
            <td>
                ${
                    a.missingFromFile1.length
                    ? a.missingFromFile1.map((v, index) => 
                        `${formatNominal(v)}<br><small style="color:#666">${a.missingRefsFile1[index] || "-"}</small>`
                      ).join("<br>")
                    : "-"
                }
            </td>
        </tr>
        `;
    });

    html += `
        <tr style="font-weight:bold; background:#f5f5f5;">
            <td colspan="3">TOTAL</td>
            <td>${formatNominal(totalPembukuan)}</td>
            <td>${formatNominal(totalMotion)}</td>
        </tr>
    `;

    html += "</table>";
    document.getElementById("wresult").innerHTML = html;
}

function formatNominal(value) {
    if (value === null || value === undefined) return "-";

    let str = String(value);

    let clean = str.replace(/[^0-9]/g, "");
    if (!clean) return "-";

    return Number(clean).toLocaleString("en-US");
}

// ================= HALAMAN SWITCHER ===================
function showPage(page) {
    document.getElementById("page-deposit").style.display = "none";
    document.getElementById("page-withdraw").style.display = "none";

    if (page === "deposit") {
        document.getElementById("page-deposit").style.display = "block";
    } else {
        document.getElementById("page-withdraw").style.display = "block";
    }
}

// ========== POPUP HELP ==========
function openHelp() {
    document.getElementById("helpModal").style.display = "block";
}

function closeHelp() {
    document.getElementById("helpModal").style.display = "none";
}

window.onclick = function(event) {
    const modal = document.getElementById("helpModal");
    if (event.target === modal) {
        modal.style.display = "none";
    }
};
