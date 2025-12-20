# Seed Posts via API
# Creates sample posts for communities using the post-service API

$BASE_URL = "http://localhost:8000/api/service/posts"

# Community IDs and their sample posts
$COMMUNITY_POSTS = @{
    "c0000001-0000-4000-8000-000000000001" = @{
        name = "Web Development"
        members = @(
            "a1b2c3d4-1111-4000-8000-000000000001",
            "a1b2c3d4-5555-4000-8000-000000000005", 
            "fa0fe1b0-7b9b-4351-a5e0-5ba54ece726e",
            "a1b2c3d4-8888-4000-8000-000000000008"
        )
        posts = @(
            "Just discovered a new VS Code extension that boosted my productivity 10x! Must try if you are doing web dev.",
            "What is your favorite programming language in 2024? I am torn between TypeScript and Rust.",
            "AI is changing the way we code. GitHub Copilot has been a game changer for my workflow!",
            "Just finished my first React project with TypeScript. The learning curve was worth it!"
        )
    }
    "c0000002-0000-4000-8000-000000000002" = @{
        name = "Gaming Hub"
        members = @(
            "a1b2c3d4-3333-4000-8000-000000000003",
            "fa0fe1b0-7b9b-4351-a5e0-5ba54ece726e",
            "a1b2c3d4-7777-4000-8000-000000000007"
        )
        posts = @(
            "What games are you all playing this weekend? Looking for recommendations!",
            "The new update is amazing! Graphics improvements and new gameplay mechanics are top notch.",
            "Looking for teammates for ranked matches. Who is in? Drop your username below!"
        )
    }
    "c0000003-0000-4000-8000-000000000003" = @{
        name = "Data Science"
        members = @(
            "a1b2c3d4-6666-4000-8000-000000000006",
            "a1b2c3d4-5555-4000-8000-000000000005",
            "a1b2c3d4-7777-4000-8000-000000000007"
        )
        posts = @(
            "New breakthrough in transformer architectures! The paper on attention mechanisms is fascinating.",
            "Best resources for learning machine learning in 2024 - a comprehensive guide for beginners.",
            "Python vs R for data science - which one should beginners learn first? Discuss!"
        )
    }
    "c0000004-0000-4000-8000-000000000004" = @{
        name = "Photography"
        members = @(
            "a1b2c3d4-4444-4000-8000-000000000004",
            "a1b2c3d4-2222-4000-8000-000000000002"
        )
        posts = @(
            "Golden hour is my favorite time to shoot. The soft lighting makes everything magical!",
            "What camera do you recommend for beginners? Looking to upgrade from my phone."
        )
    }
    "c0000005-0000-4000-8000-000000000005" = @{
        name = "Fitness"
        members = @(
            "a1b2c3d4-9999-4000-8000-000000000009",
            "a1b2c3d4-3333-4000-8000-000000000003"
        )
        posts = @(
            "My 6-month transformation journey. Consistency is key! Never thought I could get here.",
            "Best protein sources for muscle building on a budget. No expensive supplements needed!"
        )
    }
    "c0000006-0000-4000-8000-000000000006" = @{
        name = "Music Production"
        members = @(
            "a1b2c3d4-2222-4000-8000-000000000002",
            "fa0fe1b0-7b9b-4351-a5e0-5ba54ece736e"
        )
        posts = @(
            "Just released my first track! Would love some feedback from the community.",
            "FL Studio vs Ableton - eternal debate! Which DAW do you prefer and why?"
        )
    }
    "c0000007-0000-4000-8000-000000000007" = @{
        name = "Book Club"
        members = @(
            "a1b2c3d4-1111-4000-8000-000000000001",
            "a1b2c3d4-6666-4000-8000-000000000006"
        )
        posts = @(
            "Currently reading Atomic Habits and it is changing my perspective on life!",
            "Top 10 books every developer should read. Not just coding but soft skills too!"
        )
    }
    "c0000008-0000-4000-8000-000000000008" = @{
        name = "Startups"
        members = @(
            "a1b2c3d4-5555-4000-8000-000000000005",
            "a1b2c3d4-7777-4000-8000-000000000007"
        )
        posts = @(
            "Just closed our seed round! Sharing lessons from 6 months of fundraising.",
            "Building in public - pros and cons. Has anyone tried this approach?"
        )
    }
}

Write-Host "=== Seeding Community Posts via API ===" -ForegroundColor Cyan
$totalPosts = 0

foreach ($communityId in $COMMUNITY_POSTS.Keys) {
    $community = $COMMUNITY_POSTS[$communityId]
    Write-Host "`nCommunity: $($community.name)" -ForegroundColor Yellow
    
    for ($i = 0; $i -lt $community.posts.Count; $i++) {
        $content = $community.posts[$i]
        $userId = $community.members[$i % $community.members.Count]
        
        $boundary = [System.Guid]::NewGuid().ToString()
        $LF = "`r`n"
        $bodyLines = @(
            "--$boundary",
            "Content-Disposition: form-data; name=`"content`"",
            "",
            $content,
            "--$boundary",
            "Content-Disposition: form-data; name=`"visibility`"",
            "",
            "public",
            "--$boundary",
            "Content-Disposition: form-data; name=`"group_id`"",
            "",
            $communityId,
            "--$boundary--"
        ) -join $LF
        
        $headers = @{
            "x-user-id" = $userId
        }
        
        try {
            $response = Invoke-RestMethod `
                -Uri "$BASE_URL/posts" `
                -Method Post `
                -Headers $headers `
                -ContentType "multipart/form-data; boundary=$boundary" `
                -Body $bodyLines
            
            $shortContent = $content.Substring(0, [Math]::Min(50, $content.Length))
            Write-Host "  + Created: `"$shortContent...`"" -ForegroundColor DarkGray
            $totalPosts++
        } catch {
            Write-Host "  x Error: $($_.Exception.Message)" -ForegroundColor Red
        }
        
        # Small delay to avoid rate limiting
        Start-Sleep -Milliseconds 200
    }
}

Write-Host "`n=== Seed Complete ===" -ForegroundColor Cyan
Write-Host "Total posts created: $totalPosts" -ForegroundColor Green
